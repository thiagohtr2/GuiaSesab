// Netlify Identity emails may return to the site's root. Keep tokens in the URL fragment.
if(/(?:^|&)(confirmation_token|recovery_token|error_description)=/.test(location.hash.slice(1))){
 location.replace('portal.html'+location.hash);
}
