package cn.starisle.catalog.internal;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

/** Reads ISO-BMFF metadata for regular and fragmented H.264 MP4 files. */
final class Mp4Video {
    private static final int MAX_BOXES = 100_000;
    private static final int MAX_SECONDS = 60;
    private final ByteBuffer input;
    private int boxesRead;

    private Mp4Video(byte[] data) {
        input = ByteBuffer.wrap(data);
    }

    static void validate(byte[] data) {
        new Mp4Video(data).validate();
    }

    private void validate() {
        var top = boxes(0, input.limit());
        require(top, "ftyp").check(0, 8);
        check(top.stream().anyMatch(box -> box.type().equals("mdat") && box.start() < box.end()));
        var movie = children(require(top, "moov"));
        var presentation = timing(require(movie, "mvhd"));
        var tracks = new HashMap<Long, Track>();
        boolean hasVideo = false;
        for (var entry : movie) {
            if (!entry.type().equals("trak")) continue;
            var track = children(entry);
            var media = children(require(track, "mdia"));
            String handler = type(require(media, "hdlr").check(8, 4));
            if (!handler.equals("vide") && !handler.equals("soun")) continue;
            var timing = timing(require(media, "mdhd"));
            var trackHeader = require(track, "tkhd");
            boolean large = versionOne(trackHeader);
            long id = uint(trackHeader, large ? 20 : 12);
            presentation.checkDuration(large ? ulong(trackHeader, 28) : uint(trackHeader, 20));
            check(id != 0 && tracks.putIfAbsent(id, timing) == null);
            if (handler.equals("vide")) {
                checkAvc(media);
                timing.video = true;
                hasVideo = true;
            }
        }
        check(hasVideo);

        var defaults = find(movie, "mvex");
        if (defaults != null) {
            for (var box : children(defaults)) {
                if (!box.type().equals("trex")) continue;
                var timing = tracks.get(uint(box, 4));
                if (timing != null) timing.defaultSampleDuration = uint(box, 12);
            }
        }
        for (var box : top) {
            if (!box.type().equals("moof")) continue;
            for (var fragment : children(box)) {
                if (!fragment.type().equals("traf")) continue;
                var fields = children(fragment);
                var header = require(fields, "tfhd");
                var timing = tracks.get(uint(header, 4));
                if (timing != null) readFragment(timing, fields, header);
            }
        }
        check(tracks.values().stream().anyMatch(track -> track.video && track.end > 0));
    }

    private Track timing(Box header) {
        boolean large = versionOne(header);
        int offset = large ? 20 : 12;
        return new Track(uint(header, offset), large ? ulong(header, offset + 4) : uint(header, offset + 4));
    }

    private void checkAvc(List<Box> media) {
        var info = children(require(media, "minf"));
        var table = children(require(info, "stbl"));
        var samples = require(table, "stsd");
        check(uint(samples, 4) == 1);
        var descriptions = boxes(samples.start() + 8, samples.end());
        check(descriptions.size() == 1);
        var avc = descriptions.getFirst();
        check(avc.type().equals("avc1") || avc.type().equals("avc3"));
        int dimensions = avc.check(24, 4);
        check(input.getShort(dimensions) != 0 && input.getShort(dimensions + 2) != 0);
        var config = require(boxes(avc.check(78, 0), avc.end()), "avcC");
        config.check(0, 7);
        check(input.get(config.start()) == 1);
    }

    private void readFragment(Track track, List<Box> fields, Box header) {
        int flags = (int) uint(header, 0) & 0xffffff;
        int offset = 8 + ((flags & 1) != 0 ? 8 : 0) + ((flags & 2) != 0 ? 4 : 0);
        long defaultDuration = (flags & 8) != 0 ? uint(header, offset) : track.defaultSampleDuration;
        var time = find(fields, "tfdt");
        long end = time == null ? track.end : versionOne(time) ? ulong(time, 4) : uint(time, 4);
        track.checkDuration(end);
        for (var run : fields) {
            if (!run.type().equals("trun")) continue;
            int sampleFlags = (int) uint(run, 0) & 0xffffff;
            long count = uint(run, 4);
            check(count <= 1_000_000);
            int start = 8 + ((sampleFlags & 1) != 0 ? 4 : 0) + ((sampleFlags & 4) != 0 ? 4 : 0);
            int stride = Integer.bitCount(sampleFlags & 0xf00) * 4;
            run.check(start, (int) count * stride);
            if ((sampleFlags & 0x100) == 0) {
                check(count == 0 || defaultDuration != 0);
                end += count * defaultDuration;
            } else {
                for (int sample = 0; sample < count; sample++) {
                    end += uint(run, start + sample * stride);
                }
            }
            track.checkDuration(end);
        }
        track.end = Math.max(track.end, end);
    }

    private List<Box> children(Box parent) {
        return boxes(parent.start(), parent.end());
    }

    private List<Box> boxes(int start, int end) {
        var boxes = new ArrayList<Box>();
        int position = start;
        while (position < end) {
            check(end - position >= 8 && ++boxesRead <= MAX_BOXES);
            long length = Integer.toUnsignedLong(input.getInt(position));
            String type = type(position + 4);
            int header = 8;
            if (length == 1) {
                check(end - position >= 16);
                length = input.getLong(position + 8);
                header = 16;
            } else if (length == 0) {
                length = end - position;
            }
            check(length >= header && length <= end - position);
            int next = position + (int) length;
            boxes.add(new Box(type, position + header, next));
            position = next;
        }
        return boxes;
    }

    private String type(int offset) {
        return new String(input.array(), offset, 4, StandardCharsets.ISO_8859_1);
    }

    private boolean versionOne(Box box) {
        byte version = input.get(box.check(0, 1));
        check(version == 0 || version == 1);
        return version == 1;
    }

    private long uint(Box box, int offset) {
        return Integer.toUnsignedLong(input.getInt(box.check(offset, 4)));
    }

    private long ulong(Box box, int offset) {
        long value = input.getLong(box.check(offset, 8));
        check(value >= 0);
        return value;
    }

    private static Box find(List<Box> boxes, String type) {
        return boxes.stream().filter(box -> box.type().equals(type)).findFirst().orElse(null);
    }

    private static Box require(List<Box> boxes, String type) {
        var box = find(boxes, type);
        check(box != null);
        return box;
    }

    private static void check(boolean valid) {
        if (!valid) throw new IllegalArgumentException("Invalid or unsupported MP4");
    }

    private record Box(String type, int start, int end) {
        int check(int offset, int length) {
            Mp4Video.check(offset >= 0 && length >= 0 && offset <= end - start - length);
            return start + offset;
        }
    }

    private static final class Track {
        final long timescale;
        long end;
        long defaultSampleDuration;
        boolean video;

        Track(long timescale, long end) {
            this.timescale = timescale;
            checkDuration(end);
            this.end = end;
        }

        void checkDuration(long ticks) {
            check(timescale > 0 && ticks >= 0 && ticks <= MAX_SECONDS * timescale);
        }
    }
}
