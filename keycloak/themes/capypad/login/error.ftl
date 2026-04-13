<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>

    <#if section = "header">
        <div class="capypad-logo">
            <span class="capypad-logo-text">
                <span class="capypad-logo-purple">&lt;/</span><span class="capypad-logo-pink">Capy</span><span class="capypad-logo-stone">Pad</span><span class="capypad-logo-purple">&gt;</span>
            </span>
        </div>
    </#if>

    <#if section = "form">
        <div class="capypad-alert capypad-alert-error">
            ${kcSanitize(message.summary)?no_esc}
        </div>
        <#if skipLink??>
        <#else>
            <#if client?? && client.baseUrl?has_content>
                <a href="${client.baseUrl}" class="capypad-btn-primary" style="text-align:center;text-decoration:none;">${kcSanitize(msg("backToApplication"))?no_esc}</a>
            </#if>
        </#if>
    </#if>

</@layout.registrationLayout>
