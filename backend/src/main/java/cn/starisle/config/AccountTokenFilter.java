package cn.starisle.config;

import cn.starisle.identity.internal.AccountService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Locale;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

final class AccountTokenFilter extends OncePerRequestFilter {
    private final AccountService accounts;

    AccountTokenFilter(AccountService accounts) {
        this.accounts = accounts;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        accounts.authenticate(request.getHeader(HttpHeaders.AUTHORIZATION)).ifPresent(account -> {
            var authority = new SimpleGrantedAuthority("ROLE_" + account.role().toUpperCase(Locale.ROOT));
            var authentication = UsernamePasswordAuthenticationToken.authenticated(account, null, List.of(authority));
            var context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(authentication);
            SecurityContextHolder.setContext(context);
        });
        chain.doFilter(request, response);
    }
}
