// Tutorial: https://docs.joinmastodon.org/client/intro/

// For account actions: https://docs.joinmastodon.org/client/authorized/#actions

// semi-frontend agnostic, catering to the content I choose to display but agnostic to the way they are displayed

const targetURL = "https://mastodon.social";

const accessToken = getCookie("access_token");

const contentInsert = document.getElementById("content-insert");

const templateStatus  = document.getElementById("template-status");
const templateAccount = document.getElementById("template-account");

const buttonLoadStatusesPublic    = document.getElementById("button-load-statuses-public");
const buttonLoadStatusesFollowing = document.getElementById("button-load-statuses-following");
const inputLoadFromSearch         = document.getElementById("input-load-from-search");
const buttonAccount               = document.getElementById("button-account");

buttonLoadStatusesPublic.onclick    = function() { setContextToTimeline(true, false, "/api/v1/timelines/public?limit=40"); };
buttonLoadStatusesFollowing.onclick = function() { setContextToTimeline(false, true, "/api/v1/timelines/home?limit=40"); };
inputLoadFromSearch.onchange        = refreshContext;

const account = await getLoggedInAccount();



if (account) {

    // set account button to go to user profile
    buttonAccount.innerText = account.username;
    
    buttonAccount.onclick = function() { 
        window.location.href = `?search=@${ account.acct }`;
    };
    
} else {

    // set account button to log in
    buttonAccount.onclick = requestAuthentication;
}

inputLoadFromSearch.value = new URLSearchParams(window.location.search).get("search");
refreshContext();



/*
 * BELOW THIS ARE FUNCTION DECLARATIONS
 */

/*
 * Helper functions
 */

function isBlank(string) {

    return string.trim().length == 0;
}

function hideElement(element) {

    element.style.display = "none";
}

function embedEmojis(string, emojis) {

    for (const emoji of emojis) {

        string = string.replaceAll(`:${ emoji.shortcode }:`, `<img class="emoji" alt=":${ emoji.shortcode }:" title=":${ emoji.shortcode }:" src="${ emoji.url }">`);
    }

    return string;
}

async function get(endpoint) {

    let payload;

    if (accessToken) {
        
        payload = {
            method: "GET",
            headers: {
                "content-type":  "application/json",
                "Authorization": "Bearer " + accessToken
            }
        };
        
    } else {

        payload = {
            method: "GET",
            headers: {
                "content-type":  "application/json"
            }
        };
    }
    
    const response = await fetch(targetURL + endpoint, payload);

    if (response.status == 200) {
        
        return response;
        
    } else {
        
        return null;
    }
}

async function insertAccount(account) {

    console.log("DEBUG_ACCT:");
    console.log(account);

    let acctEmbed = templateAccount.content.cloneNode(true);

    acctEmbed.getElementById("avatar").src                   = account.avatar;
    acctEmbed.getElementById("header").style.backgroundImage = `url("${ account.header }")`;
    acctEmbed.getElementById("note").innerHTML               = embedEmojis(account.note, account.emojis); // account.note is never null, just empty, so this is ok :)
    acctEmbed.getElementById("followers-count").innerText    = account.followers_count;
    acctEmbed.getElementById("following-count").innerText    = account.following_count;

    acctEmbed.getElementById("display-name").innerHTML = embedEmojis(
        isBlank(account.display_name)
            ? account.username
            : account.display_name,
        account.emojis
    );

    let accountPart = acctEmbed.getElementById("account");
    accountPart.innerText = "@" + account.acct;
    accountPart.href      = "?search=@" + account.acct;
    
    contentInsert.appendChild(acctEmbed);
}

async function insertStatuses(statuses) {

    console.log("DEBUG_STATUSES:");
    console.log(statuses);

    if (statuses.length == 0) {
        contentInsert.innerHTML += "No statuses to display.";
        return;
    }

    for (const sourceStatus of statuses) {

        // for now just skip any sensitive statuses
        if (sourceStatus.sensitive) {
            continue;
        }

        // initialized the status embed
        let statusEmbed = templateStatus.content.cloneNode(true);

        // if this is a reblog, we need to display the reblog and not this status
        const displayedStatus = sourceStatus.reblog == null ? sourceStatus : sourceStatus.reblog;
        
        if (sourceStatus == displayedStatus) {

            // hide reblogger info
            hideElement(statusEmbed.getElementById("reblogger-account-info"));
            
        } else {

            // fill reblogger info
            const rebloggerAccountPart = statusEmbed.getElementById("reblogger-account");
            rebloggerAccountPart.innerText = "@" + sourceStatus.account.acct;
            rebloggerAccountPart.href      = "?search=@" + sourceStatus.account.acct;
        }

        // account
        {
            statusEmbed.getElementById("display-name").innerHTML = embedEmojis(
                isBlank(displayedStatus.account.display_name)
                    ? displayedStatus.account.username
                    : displayedStatus.account.display_name,
                displayedStatus.account.emojis
            );
            
            statusEmbed.getElementById("avatar").src = displayedStatus.account.avatar;

            const accountPart = statusEmbed.getElementById("account");
            accountPart.innerText = "@" + displayedStatus.account.acct;
            accountPart.href      = "?search=@" + displayedStatus.account.acct;
        }

        // content
        {
            if (isBlank(displayedStatus.content)) {
                hideElement(statusEmbed.getElementById("content"));
            } else {
                statusEmbed.getElementById("content").innerHTML = embedEmojis(displayedStatus.content, displayedStatus.emojis);
            }
        }

        // image gallery
        {
            if (displayedStatus.media_attachments.length == 0) {

                hideElement(statusEmbed.getElementById("images"));
                
            } else {

                let imageEmbed = "";
    
                for (const media of displayedStatus.media_attachments) {
        
                    if (media.type === "image")
                        imageEmbed += `<img src="${ media.url }">`;
                }
    
                statusEmbed.getElementById("images").innerHTML = imageEmbed;
            }
        }

        // analytics
        {
            statusEmbed.getElementById("like-count").innerText    = displayedStatus.favourites_count;
            statusEmbed.getElementById("repost-count").innerText  = displayedStatus.reblogs_count;
            statusEmbed.getElementById("comment-count").innerText = displayedStatus.replies_count;
        }
        
        contentInsert.appendChild(statusEmbed);
    }
}



/*
 * Context control
 */

async function refreshContext() {

    const term = inputLoadFromSearch.value.trim().replace("#", "");

    if (isBlank(term)) {

        setContextToTimeline(true, false, "/api/v1/timelines/public?limit=40");
        return;
    }

    window.history.pushState({}, "", "?search=" + term);

    // reset context
    buttonLoadStatusesPublic.disabled = false;
    buttonLoadStatusesFollowing.disabled = false;
    buttonAccount.disabled = false;
    
    contentInsert.innerHTML = "Loading...";

    // decode what they're trying to search (account or hashtag)
    if (term.charAt(0) === '@') {

        setContextToAccount(term);
        
    } else {

        // hashtag search
        await setContextToTimeline(false, false, `/api/v1/timelines/tag/${ term.replace("#", "") }?limit=40`);

        contentInsert.innerHTML = `<p><strong>Statuses with #${ term }</strong></p>` + contentInsert.innerHTML;

    }
}

async function setContextToAccount(handle) {

    if (account && handle === `@${ account.acct }`) {
        buttonAccount.disabled = true;
    }

    // account search
    const lookupResponse = await get(`/api/v1/accounts/lookup?acct=${ handle }`);
    contentInsert.innerHTML = "";
    
    if (lookupResponse) {

        const lookupJson = await lookupResponse.json();

        const acctResponse         = await get(`/api/v1/accounts/${ lookupJson.id }`);
        const acctStatusesResponse = await get(`/api/v1/accounts/${ lookupJson.id }/statuses`);
        
        if (acctResponse && acctStatusesResponse) {

            await insertAccount(await acctResponse.json());
            await insertStatuses(await acctStatusesResponse.json());
            
        } else {
            
            contentInsert.innerHTML = "There was an error.";
        }
        
    } else {
        
        contentInsert.innerHTML = "There was an error.";
    }
}

async function setContextToTimeline(isPublic, isHome, endpoint) {
    
    // reset context
    buttonLoadStatusesPublic.disabled = isPublic;
    buttonLoadStatusesFollowing.disabled = isHome;
    buttonAccount.disabled = false;
    inputLoadFromSearch.value = "";

    if ((isPublic || isHome) && new URLSearchParams(window.location.search).get("search"))
        window.history.pushState({}, "", "?");
    
    // fetch
    contentInsert.innerHTML = "Loading...";
    const response = await get(endpoint);
    
    if (response) {

        contentInsert.innerHTML = "";
        await insertStatuses(await response.json());
        
    } else {
        
        contentInsert.innerHTML = "There was an error retrieving the timeline.";
    }
}



/*
 * Account stuff
 */
async function getLoggedInAccount() {

    if (accessToken) {

        // get account with accessToken (and make sure the accessToken is still valid)
        const credentialsResponse = await get("/api/v1/accounts/verify_credentials");
        
        if (credentialsResponse.status == 200) {

            // return the account
            return await credentialsResponse.json();
            
        } else {

            // if accessToken is not valid, clear its cookie (effectively automatically logging out)
            accessToken = null;
            setCookie("access_token", "", -100);

            return null;

        }
        
    } else {

        // not logged in
        return null;
    }
}

async function requestAuthentication() {

    // https://docs.joinmastodon.org/client/token/#creating-our-application

    // register a client application (for client_id and client_secret)
    const applicationRequestResponse = await fetch(targetURL + "/api/v1/apps",
        {
            method: "POST",
            headers: {
                "content-type": "application/json"
            },
            body: JSON.stringify({
                "client_name":   "Test Application",
                "redirect_uris": [ "https://www.fatchicks.cc/c/fediverse/auth.html" ],
                "scopes":        "read write push",
                "website":       "https://www.fatchicks.cc/c/fediverse/"
            })
        }
    );

    if (applicationRequestResponse.status != 200) {
        
        alert("Error authenticating: " + applicationRequestResponse.status);
        return;
    }

    const credentialApplication = await applicationRequestResponse.json();
    const clientID              = credentialApplication.client_id;
    const clientSecret          = credentialApplication.client_secret;

    // cache client_id and client_secret for auth.html to use
    setCookie("client_id", clientID, 1);
    setCookie("client_secret", clientSecret, 1);
    
    /*
     * Tell the user to authorize themselves under that client.
     * 
     * They will then be redirected to the auth page where the
     * resulting code will be used to get an access token, which
     * is stored in cookies and used to log them in.
     */
    window.location.href = `${ targetURL }/oauth/authorize/?client_id=${ clientID }&scope=read+write+push&redirect_uri=https://www.fatchicks.cc/c/fediverse/auth.html&response_type=code&state=${ targetURL }`;
}
