<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icon from '@starisle/ui/Icon.vue'
import {
  DEMO_ASSETS,
  money,
  productVariants,
  productTags,
  tagKey,
  normalizeProductTags,
  saveDemoProduct,
  type DemoProduct,
  type DemoState,
} from '@starisle/shared/demo'
import { uploadProductImage } from '@starisle/shared/product-images'
import { uploadProductVideo } from '@starisle/shared/product-videos'
import { springMarketplaceEnabled } from '@starisle/shared/auth'

const props = defineProps<{ product?: DemoProduct }>()
const emit = defineEmits<{ saved: [state: DemoState]; busy: [value: boolean] }>()
const title = ref(props.product?.title || '')
const subtitle = ref(props.product?.subtitle || '')
const description = ref(props.product?.description || '')
const video = ref(props.product?.video || '')
const uploadingVideo = ref(false)
const category = ref(props.product?.category || '周边')
const tags = ref(props.product ? [...productTags(props.product)] : [])
const tagInput = ref('')
const images = ref([
  ...(props.product?.images?.length
    ? props.product.images
    : [props.product?.cover || DEMO_ASSETS.figurine]),
])
const custom = ref(!props.product || !!props.product.skus)
const converted = ref(false)
const price = ref(props.product ? money(props.product.price) : '')
const stock = ref(props.product ? String(props.product.stock) : '')
const skus = ref(
  props.product?.skus?.length
    ? props.product.skus.map((sku) => ({
        id: sku.id,
        name: sku.name,
        price: money(sku.price),
        stock: String(sku.stock),
      }))
    : [{ id: 'standard', name: '默认款', price: price.value, stock: stock.value }],
)
const published = ref(props.product?.published ?? true)
const error = ref('')
const saving = ref(false)
const uploading = ref(false)
const busy = computed(() => saving.value || uploading.value || uploadingVideo.value)
watch(busy, (value) => emit('busy', value), { flush: 'sync' })
const totalStock = computed(() =>
  custom.value
    ? skus.value.reduce((sum, sku) => sum + (Number(sku.stock) || 0), 0)
    : Number(stock.value) || 0,
)

function addTags() {
  if (busy.value || !tagInput.value.trim()) return
  try {
    const incoming = tagInput.value.split(/[,，、;；\n]+/).filter((value) => value.trim())
    const unique = [...tags.value]
    for (const tag of normalizeProductTags(incoming)) {
      if (!unique.some((existing) => tagKey(existing) === tagKey(tag))) unique.push(tag)
    }
    tags.value = normalizeProductTags(unique)
    tagInput.value = ''
    error.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '标签无效'
  }
}
function setCover(index: number) {
  if (busy.value || index < 0 || index >= images.value.length) return
  images.value = [images.value[index]!, ...images.value.filter((_, position) => position !== index)]
}
function sample(cover: string) {
  if (busy.value) return
  if (!images.value.includes(cover) && images.value.length < 6) images.value.push(cover)
  setCover(images.value.indexOf(cover))
}
function chooseImages() {
  if (busy.value || images.value.length >= 6) return
  uni.chooseImage({
    count: 6 - images.value.length,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    async success(result) {
      uploading.value = true
      error.value = ''
      try {
        const replaceSample =
          !props.product &&
          images.value.length === 1 &&
          Object.values(DEMO_ASSETS).includes(images.value[0]!)
        const paths =
          typeof result.tempFilePaths === 'string' ? [result.tempFilePaths] : result.tempFilePaths
        for (const [index, path] of paths.entries()) {
          const url = await uploadProductImage(path)
          if (index === 0 && replaceSample) images.value = []
          if (images.value.length < 6) images.value.push(url)
        }
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : '图片上传失败，请重试'
      } finally {
        uploading.value = false
      }
    },
    fail(result) {
      if (!result.errMsg?.includes('cancel')) error.value = '无法选择图片，请重试'
    },
  })
}
function chooseVideo() {
  if (busy.value) return
  uni.chooseVideo({
    sourceType: ['album', 'camera'],
    compressed: true,
    maxDuration: 60,
    async success(result) {
      uploadingVideo.value = true
      error.value = ''
      try {
        if (result.size > 20 * 1024 * 1024) throw new Error('视频不能超过 20 MB')
        if (result.duration > 60) throw new Error('视频不能超过 60 秒')
        video.value = await uploadProductVideo(result.tempFilePath)
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : '视频上传失败，请重试'
      } finally {
        uploadingVideo.value = false
      }
    },
    fail(result) {
      if (!result.errMsg?.includes('cancel')) error.value = '无法选择视频，请重试'
    },
  })
}
function enableCustom() {
  if (!props.product || busy.value) return
  skus.value = productVariants(props.product).map((sku, index) => ({
    id: sku.id,
    name: sku.name,
    price: index ? money(Number(price.value) * 100 + 3000) : price.value,
    stock: index ? '0' : stock.value,
  }))
  converted.value = true
  custom.value = true
}
function addSku() {
  if (busy.value || skus.value.length >= 12) return
  skus.value.push({
    id: `sku-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    price: '',
    stock: '',
  })
}
function changePublished(event: unknown) {
  published.value = !!(event as { detail?: { value?: boolean } }).detail?.value
}
async function save() {
  if (busy.value) return
  error.value = ''
  saving.value = true
  try {
    if (!title.value.trim()) throw new Error('请填写商品名称')
    if (!images.value.length) throw new Error('请至少选择一张商品图片')
    const pendingTags = tagInput.value.split(/[,，、;；\n]+/).filter((value) => value.trim())
    const savedTags = [...tags.value]
    for (const tag of normalizeProductTags(pendingTags)) {
      if (!savedTags.some((existing) => tagKey(existing) === tagKey(tag))) savedTags.push(tag)
    }
    const validatedTags = normalizeProductTags(savedTags)
    const fields: Record<string, unknown> = {
      title: title.value,
      subtitle: subtitle.value,
      description: description.value,
      category: category.value,
      tags: validatedTags,
      images: images.value,
      video: video.value,
      published: published.value,
      ...(props.product ? { expectedVersion: props.product.managementVersion || 0 } : {}),
    }
    if (custom.value) {
      const names = skus.value.map((sku) => sku.name.trim().toLowerCase())
      if (names.some((name) => !name)) throw new Error('请填写每个规格的名称')
      if (new Set(names).size !== names.length) throw new Error('规格名称不能重复')
      fields.skus = skus.value.map((sku) => {
        if (
          !/^\d{1,6}(\.\d{1,2})?$/.test(sku.price) ||
          Number(sku.price) <= 0 ||
          !/^\d{1,6}$/.test(sku.stock)
        )
          throw new Error('请填写有效价格和整数库存')
        const original = props.product?.skus?.find((item) => item.id === sku.id)
        return {
          id: sku.id,
          name: sku.name,
          price: sku.price,
          ...(!original || Number(sku.stock) !== original.stock
            ? { stock: sku.stock, ...(original ? { expectedStock: original.stock } : {}) }
            : {}),
        }
      })
    } else {
      fields.price = price.value
      if (Number(stock.value) !== props.product?.stock || !/^\d{1,6}$/.test(stock.value)) {
        fields.stock = stock.value
        fields.expectedStock = props.product?.stock
      }
    }
    const result = await saveDemoProduct(fields, props.product?.id)
    saving.value = false
    emit('saved', result)
    uni.showToast({
      title: props.product ? '商品已更新' : published.value ? '新品已上架' : '商品已保存',
      icon: 'success',
    })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存失败，请重试'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <view class="product-editor" data-testid="product-editor">
    <view class="editor-heading">
      <text>商品图片</text>
      <text class="section-note">{{ images.length }} / 6</text>
    </view>
    <text class="editor-note">第一张为封面。支持 JPG、PNG、WebP，每张不超过 2 MB。</text>
    <view class="image-grid">
      <view v-for="(image, index) in images" :key="image" class="image-item">
        <image :src="image" mode="aspectFill" @click="setCover(index)" />
        <button
          class="image-remove"
          :disabled="busy"
          :aria-label="`移除第 ${index + 1} 张图片`"
          @click="images.splice(index, 1)"
        >
          ×
        </button>
        <button
          class="cover-label"
          :class="{ selected: index === 0 }"
          :disabled="busy"
          :data-testid="`cover-image-${index}`"
          @click="setCover(index)"
        >
          {{ index === 0 ? '封面' : '设为封面' }}
        </button>
      </view>
      <button
        v-if="images.length < 6"
        class="image-upload"
        :disabled="busy"
        :loading="uploading"
        data-testid="upload-product-image"
        @click="chooseImages"
      >
        <Icon name="plus" tone="orange" :size="24" />
        <text>{{ uploading ? '上传中' : '上传图片' }}</text>
      </button>
    </view>
    <view class="sample-choices">
      <text>先用示例图</text>
      <button
        v-for="(cover, index) in [DEMO_ASSETS.figurine, DEMO_ASSETS.hero]"
        :key="cover"
        :disabled="busy"
        @click="sample(cover)"
      >
        {{ index ? '画作' : '手办' }}
      </button>
    </view>
    <view v-if="!springMarketplaceEnabled" class="editor-heading section-start">
      <text>商品视频（选填）</text>
      <text class="section-note">{{ video ? '1 / 1' : '0 / 1' }}</text>
    </view>
    <text v-if="!springMarketplaceEnabled" class="editor-note">
      支持 MP4（H.264），最长 60 秒、最大 20 MB。商品封面仍使用第一张图片。
    </text>
    <video
      v-if="video"
      :key="video"
      :src="video"
      :poster="images[0]"
      class="product-video"
      :autoplay="false"
      controls
      data-testid="editor-product-video"
      @error="error = '视频无法播放，请尝试其他 MP4 视频'"
    />
    <view v-if="!springMarketplaceEnabled" class="video-actions">
      <button
        class="secondary-button"
        :disabled="busy"
        :loading="uploadingVideo"
        data-testid="upload-product-video"
        @click="chooseVideo"
      >
        {{ uploadingVideo ? '视频上传中…' : video ? '更换视频' : '上传视频' }}
      </button>
      <button
        v-if="video"
        class="secondary-button"
        :disabled="busy"
        data-testid="remove-product-video"
        @click="video = ''"
      >
        移除视频
      </button>
    </view>
    <view class="editor-heading section-start"><text>基本信息</text></view>
    <text class="form-label">商品名称</text>
    <input
      v-model="title"
      :disabled="busy"
      class="form-input"
      placeholder="例如：星之花旅人收藏挂件"
      aria-label="商品名称"
      data-testid="edit-product-title"
      maxlength="60"
    />
    <text class="form-label">商品分类</text>
    <view class="category-choices">
      <button
        v-for="item in ['周边', '画作']"
        :key="item"
        :disabled="busy"
        :class="{ selected: category === item }"
        :data-testid="`product-category-${item}`"
        @click="category = item as '周边' | '画作'"
      >
        {{ item }}
      </button>
    </view>
    <text class="form-label">
      商品简介
      <text class="optional">选填</text>
    </text>
    <input
      v-model="subtitle"
      :disabled="busy"
      class="form-input"
      placeholder="一句话介绍这份商品，最多 100 字"
      data-testid="edit-product-subtitle"
      maxlength="100"
    />
    <text class="form-label">
      商品标签
      <text class="optional">选填</text>
    </text>
    <text class="editor-note">
      最多 10 个标签，每个最多 12 字。可填写作品/IP、角色或品类，用逗号分隔或逐个添加。
    </text>
    <view class="tag-input-row">
      <input
        v-model="tagInput"
        :disabled="busy"
        class="form-input"
        placeholder="例如：原神，徽章，手作"
        confirm-type="done"
        data-testid="edit-product-tag"
        maxlength="100"
        @confirm="addTags"
      />
      <button
        class="secondary-button"
        :disabled="busy || !tagInput.trim()"
        data-testid="add-product-tag"
        @click="addTags"
      >
        添加
      </button>
    </view>
    <view v-if="tags.length" class="editor-tags">
      <button
        v-for="(tag, index) in tags"
        :key="tag"
        class="editor-tag"
        :disabled="busy"
        :aria-label="`移除标签 ${tag}`"
        :data-testid="`remove-tag-${index}`"
        @click="tags.splice(index, 1)"
      >
        #{{ tag }} ×
      </button>
    </view>
    <text class="form-label">
      商品详情
      <text class="optional">选填</text>
    </text>
    <textarea
      v-model="description"
      :disabled="busy"
      class="form-input description-input"
      placeholder="介绍商品内容、款式差异和购买须知，最多 2000 字"
      data-testid="edit-product-description"
      maxlength="2000"
    />
    <view class="editor-heading section-start">
      <text>规格与库存</text>
      <text class="section-note">合计 {{ totalStock }} 件</text>
    </view>
    <template v-if="custom">
      <text v-if="converted" class="conversion-note">
        已将原共用库存放入第一个规格，其余规格库存为 0。请核对并重新分配，总库存等于各规格库存之和。
      </text>
      <view
        v-for="(sku, index) in skus"
        :key="sku.id"
        class="sku-editor"
        :data-testid="`sku-editor-${index}`"
      >
        <view class="sku-heading">
          <text>规格 {{ index + 1 }}</text>
          <button
            :disabled="busy || skus.length === 1"
            :aria-label="`删除规格 ${index + 1}`"
            @click="skus.splice(index, 1)"
          >
            删除
          </button>
        </view>
        <input
          v-model="sku.name"
          :disabled="busy"
          class="form-input"
          placeholder="规格名称，例如：樱粉款 / 星空款"
          :data-testid="`sku-name-${index}`"
          maxlength="30"
        />
        <view class="sku-fields">
          <view>
            <text class="form-label">价格（元）</text>
            <input
              v-model="sku.price"
              :disabled="busy"
              class="form-input"
              type="digit"
              placeholder="0.00"
              :data-testid="index === 0 ? 'edit-product-price' : `sku-price-${index}`"
              maxlength="9"
            />
          </view>
          <view>
            <text class="form-label">库存（件）</text>
            <input
              v-model="sku.stock"
              :disabled="busy"
              class="form-input"
              type="number"
              placeholder="0"
              :data-testid="index === 0 ? 'edit-product-stock' : `sku-stock-${index}`"
              maxlength="6"
            />
          </view>
        </view>
      </view>
      <button
        class="secondary-button add-sku"
        :disabled="busy || skus.length >= 12"
        data-testid="add-product-sku"
        @click="addSku"
      >
        添加规格
        <text>{{ skus.length }} / 12</text>
      </button>
    </template>
    <template v-else>
      <text class="editor-note">
        此商品的标准版、礼盒版仍共用库存。可继续修改，或启用自定义规格分别设置价格和库存。
      </text>
      <view class="sku-fields">
        <view>
          <text class="form-label">价格（元）</text>
          <input
            v-model="price"
            :disabled="busy"
            class="form-input"
            type="digit"
            data-testid="edit-product-price"
            maxlength="9"
          />
        </view>
        <view>
          <text class="form-label">共用库存</text>
          <input
            v-model="stock"
            :disabled="busy"
            class="form-input"
            type="number"
            data-testid="edit-product-stock"
            maxlength="6"
          />
        </view>
      </view>
      <button
        class="secondary-button add-sku"
        :disabled="busy"
        data-testid="enable-custom-skus"
        @click="enableCustom"
      >
        启用自定义规格
      </button>
    </template>
    <view class="publish-option">
      <view>
        <text>保存后上架</text>
        <text class="editor-note">关闭后仅保存在商品管理，用户暂时看不到。</text>
      </view>
      <switch
        :checked="published"
        :disabled="busy"
        color="#ad6d35"
        data-testid="product-published"
        @change="changePublished"
      />
    </view>
    <text v-if="error" class="form-error" role="alert" data-testid="product-error">
      {{ error }}
    </text>
    <button
      class="primary-button editor-save"
      :disabled="busy"
      :loading="saving"
      data-testid="save-product"
      @click="save"
    >
      {{
        uploading
          ? '图片上传中…'
          : saving
            ? '保存中…'
            : props.product
              ? '保存商品'
              : published
                ? '发布并上架'
                : '保存商品'
      }}
    </button>
  </view>
</template>

<style scoped>
.tag-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tag-input-row .form-input {
  flex: 1;
  min-width: 0;
}
.tag-input-row button {
  flex-shrink: 0;
}
.editor-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0;
}
.editor-tag {
  margin: 0;
  padding: 6px 10px;
  border-radius: 16px;
  background: #f3edf9;
  color: #765592;
  font-size: 12px;
  line-height: 1.5;
}

.product-video {
  display: block;
  width: 100%;
  height: 200px;
  margin: 12px 0;
  background: #201c28;
  border-radius: 10px;
}
.video-actions {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}
.video-actions button {
  flex: 1;
}
.product-editor {
  color: #4e3b2c;
}
.editor-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 15px;
  font-weight: 650;
}
.section-start {
  margin-top: 26px;
  padding-top: 22px;
  border-top: 1px solid #eee6dd;
}
.section-note,
.optional {
  color: #8f7b6b;
  font-size: 11px;
  font-weight: 400;
}
.optional {
  margin-left: 5px;
}
.editor-note {
  display: block;
  margin: 8px 0 12px;
  color: #8f7b6b;
  font-size: 11px;
  line-height: 1.7;
}
.image-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.image-item {
  position: relative;
  height: 100px;
  overflow: hidden;
  border-radius: 10px;
  background: #faf4ed;
}
.image-item image {
  width: 100%;
  height: 100%;
}
.image-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 25px;
  height: 25px;
  padding: 0;
  margin: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.95);
  color: #6d5140;
  font-size: 20px;
  line-height: 1;
}
.cover-label {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  min-height: 25px;
  padding: 4px;
  margin: 0;
  border-radius: 0;
  background: rgba(255, 255, 255, 0.93);
  color: #876344;
  font-size: 10px;
  line-height: 1.5;
}
.cover-label.selected {
  background: #ad6d35;
  color: #fff;
}
.image-upload {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  height: 100px;
  padding: 0;
  margin: 0;
  border: 1px dashed #dcc6b0;
  border-radius: 10px;
  background: #fdf9f4;
  color: #916a48;
  font-size: 11px;
  line-height: 1.5;
}
.sample-choices {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  color: #8f7b6b;
  font-size: 11px;
}
.sample-choices button {
  padding: 5px 10px;
  margin: 0;
  border-radius: 6px;
  background: #f8f1e9;
  color: #916a48;
  font-size: 11px;
  line-height: 1.5;
}
.category-choices {
  display: flex;
  gap: 10px;
}
.category-choices button {
  min-width: 76px;
  padding: 9px 18px;
  margin: 0;
  border: 1px solid #e9ded3;
  border-radius: 9px;
  background: #fff;
  color: #8f7b6b;
  font-size: 13px;
  line-height: 1.5;
}
.category-choices button.selected {
  border-color: #b18056;
  background: #fcf3e9;
  color: #915a2d;
}
.description-input {
  width: 100%;
  height: 120px;
  line-height: 1.7;
}
.sku-editor {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid #eee2d5;
  border-radius: 12px;
  background: #fffcf8;
}
.sku-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  color: #78604d;
  font-size: 12px;
}
.sku-heading button {
  padding: 3px 0 3px 12px;
  margin: 0;
  background: transparent;
  color: #a46b4a;
  font-size: 11px;
  line-height: 1.5;
}
.sku-fields {
  display: flex;
  gap: 12px;
}
.sku-fields > view {
  flex: 1;
  min-width: 0;
}
.sku-fields .form-label {
  margin-top: 12px;
  font-size: 12px;
}
.add-sku {
  width: 100%;
  margin-top: 12px;
  color: #91643e;
  border-color: #e5d5c3;
}
.add-sku text {
  margin-left: 8px;
  color: #9b8570;
  font-size: 11px;
}
.conversion-note {
  display: block;
  margin-top: 12px;
  padding: 10px;
  border-radius: 8px;
  background: #fff3df;
  color: #8a602e;
  font-size: 11px;
  line-height: 1.7;
}
.publish-option {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 24px 0 14px;
  font-size: 13px;
}
.publish-option > view {
  flex: 1;
  min-width: 0;
}
.publish-option .editor-note {
  margin-bottom: 0;
}
.editor-save {
  margin-top: 18px;
  background: #ad6d35;
}
</style>
