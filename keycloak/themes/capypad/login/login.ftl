<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username','password') displayInfo=realm.password && realm.registrationAllowed && !registrationDisabled??; section>

    <#if section = "header">
        <div class="capypad-logo">
            <span class="capypad-logo-text">
                <span class="capypad-logo-purple">&lt;/</span><span class="capypad-logo-pink">Capy</span><span class="capypad-logo-stone">Pad</span><span class="capypad-logo-purple">&gt;</span>
            </span>
        </div>
    </#if>

    <#if section = "form">
        <#if realm.password>
            <form id="kc-form-login" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post">
                <div class="capypad-field">
                    <label for="username" class="capypad-label">
                        <#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if>
                    </label>
                    <input tabindex="1" id="username" name="username" value="${(login.username!'')}" type="text" autofocus autocomplete="off"
                           class="capypad-input"
                           aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>" />
                    <#if messagesPerField.existsError('username','password')>
                        <span class="capypad-error" aria-live="polite">
                            ${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}
                        </span>
                    </#if>
                </div>

                <div class="capypad-field">
                    <label for="password" class="capypad-label">${msg("password")}</label>
                    <input tabindex="2" id="password" name="password" type="password" autocomplete="off"
                           class="capypad-input"
                           aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>" />
                </div>

                <div class="capypad-options-row">
                    <#if realm.rememberMe && !usernameEditDisabled??>
                        <div class="capypad-checkbox-group">
                            <input tabindex="3" id="rememberMe" name="rememberMe" type="checkbox" <#if login.rememberMe??>checked</#if>>
                            <label for="rememberMe">${msg("rememberMe")}</label>
                        </div>
                    </#if>
                    <#if realm.resetPasswordAllowed>
                        <a href="${url.loginResetCredentialsUrl}" class="capypad-link">${msg("doForgotPassword")}</a>
                    </#if>
                </div>

                <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>
                <input tabindex="4" name="login" id="kc-login" type="submit" value="${msg("doLogIn")}" class="capypad-btn-primary" />
            </form>
        </#if>
    </#if>

    <#if section = "info">
        <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
            <div class="capypad-footer">
                <span>${msg("noAccount")}
                    <a href="${url.registrationUrl}" class="capypad-link">${msg("doRegister")}</a>
                </span>
            </div>
        </#if>
    </#if>

</@layout.registrationLayout>
