<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('firstName','lastName','email','username','password','password-confirm'); section>

    <#if section = "header">
        <div class="capypad-logo">
            <span class="capypad-logo-text">
                <span class="capypad-logo-purple">&lt;/</span><span class="capypad-logo-pink">Capy</span><span class="capypad-logo-stone">Pad</span><span class="capypad-logo-purple">&gt;</span>
            </span>
            <p class="capypad-subtitle">Criar conta</p>
        </div>
    </#if>

    <#if section = "form">
        <form id="kc-register-form" action="${url.registrationAction}" method="post">

            <div class="capypad-field">
                <label for="username" class="capypad-label">${msg("username")}</label>
                <input type="text" id="username" name="username" value="${(register.formData.username!'')}" autocomplete="username"
                       class="capypad-input"
                       aria-invalid="<#if messagesPerField.existsError('username')>true</#if>" />
                <#if messagesPerField.existsError('username')>
                    <span class="capypad-error">${kcSanitize(messagesPerField.getFirstError('username'))?no_esc}</span>
                </#if>
            </div>

            <#if !realm.registrationEmailAsUsername>
                <div class="capypad-field">
                    <label for="email" class="capypad-label">${msg("email")}</label>
                    <input type="email" id="email" name="email" value="${(register.formData.email!'')}" autocomplete="email"
                           class="capypad-input"
                           aria-invalid="<#if messagesPerField.existsError('email')>true</#if>" />
                    <#if messagesPerField.existsError('email')>
                        <span class="capypad-error">${kcSanitize(messagesPerField.getFirstError('email'))?no_esc}</span>
                    </#if>
                </div>
            </#if>

            <div class="capypad-field">
                <label for="password" class="capypad-label">${msg("password")}</label>
                <input type="password" id="password" name="password" autocomplete="new-password"
                       class="capypad-input"
                       aria-invalid="<#if messagesPerField.existsError('password')>true</#if>" />
                <#if messagesPerField.existsError('password')>
                    <span class="capypad-error">${kcSanitize(messagesPerField.getFirstError('password'))?no_esc}</span>
                </#if>
            </div>

            <div class="capypad-field">
                <label for="password-confirm" class="capypad-label">${msg("passwordConfirm")}</label>
                <input type="password" id="password-confirm" name="password-confirm" autocomplete="new-password"
                       class="capypad-input"
                       aria-invalid="<#if messagesPerField.existsError('password-confirm')>true</#if>" />
                <#if messagesPerField.existsError('password-confirm')>
                    <span class="capypad-error">${kcSanitize(messagesPerField.getFirstError('password-confirm'))?no_esc}</span>
                </#if>
            </div>

            <input type="submit" value="${msg("doRegister")}" class="capypad-btn-primary" />

            <div class="capypad-footer">
                <a href="${url.loginUrl}" class="capypad-link">&larr; ${msg("backToLogin")}</a>
            </div>
        </form>
    </#if>

</@layout.registrationLayout>
