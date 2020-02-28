const cheerio = require("cheerio");
const cloudflarescraper = require("cloudscraper");
const requestModule = require("request");
const https = require("follow-redirects").https;
const fs = require("fs");
const http = require("follow-redirects").http;
const filesUrl = `${serverBase}/projects/ftb-revelation/files`;

/* Utils */
async function getPage(url) {
    console.log(`Fetching page: ${url}`);
    var options = {
        uri: url,
        jar: requestModule.jar()
    };
    const response = await cloudflarescraper.defaults().get(options);
    // const response = await cloudflarescraper
    //     .defaults()
    //     .get(url);
    const buffer = new Buffer.from(response, 'binary');
    return buffer.toString();
}


function getUrl(base, uri) {
    return `${base}${uri}`;
}

function httpsGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, resolve);
    })
}

function getIdUri(idUnified) {
    // assumption: 4 + 3 = 7
    length = idUnified.length;

    // assumption, if length > 7, the first part of the uri (a/b -> a) will change, and b's length will not
    const idFirst = idUnified.slice(0, length - 3);
    const idSecond = idUnified.slice(length - 3, length);

    return `${idFirst}/${idSecond}`;
}

/**
 * Constructs the actual CDN download link, based on an educated guess of the ID formatting.
 */
function getCdnUrl(downloadPageUrl, filename) {
    const idUnified = downloadPageUrl.split("/").pop(); // last part of URL, assumption: no params (?a=b&c=d)

    return `${cdnUrlBase}${getIdUri(idUnified)}/${filename}`;
}

async function getCdnUrlFromDownloadUrl(downloadPageUrl) {
    // We also need the filename. To do that, we need to fetch the download page from downloadPageUrl
    const downloadPage$ = cheerio.load(await getPage(downloadPageUrl));

    let entries = downloadPage$("main article .text-sm:nth-child(2)");
    let filename = downloadPage$(entries[0]).text();

    if (!filename) {
        elem = downloadPage$(".details-info li:nth-child(1) .overflow-tip");
        filename = downloadPage$(elem).text();
    }

    return getCdnUrl(downloadPageUrl, filename);
}

// async function getPage(url) {
//     console.log(`Fetching page: ${url}`);

//     const response = await axios.get(url, {
//         responseType: "arraybuffer"
//     });
//     const buffer = new Buffer.from(
//         response.data,
//         "binary"
//     );
//     return buffer.toString();
// }

// const cdnUrlBase = 'https://media.forgecdn.net/files/2804/30/jei-1.14.4-6.0.0.18.jar';

async function getModUrl(mod, nPages, pageNo = 1) {
  console.log("getModUrl()", mod.name);

  let url;
  if (pageNo != 1) {
    url = `${modsProjects}${mod.name}${
      mod.version ? `/files/all?page=${pageNo}` : ""
    }`;
  } else {
    url = `${modsProjects}${mod.name}${mod.version ? `/files/all` : ""}`;
  }

  console.log(`url: ${url}`);
  const $ = cheerio.load(await getPage(url));
  // console.log(`Got page for ${mod}`);

  let downloadUrl;
  if (!mod.version) {
    // console.log('Version not set. Going to get the latest version instead');
    // TODO not fixed for Curse's last update
    downloadUrl = getUrl(modsBase, $(".categories-container a").attr("href"));
  } else {
    const links = [];

    // console.log(`We have ${nPages} pages`);

    // get the number of pages (for checking at the tail of the recursive call if we've reached the end of the list)
    if (!nPages) {
      let items = [];
      $(".ml-auto .pagination-top").map((i, elem) => {
        const x = $("a", elem);
        // console.log(x.attr('href'));
        // console.log(x.html())
        items.push(x.attr("href"));
      });

      let max = -1;
      items.map(entry => {
        const parts = entry.split("page=");
        const pageNo = parseInt(parts[parts.length - 1]);
        if (pageNo > max) {
          max = pageNo;
        }
      });

      nPages = max;
      // console.log(`Got ${nPages} pages`);
    }

    $(".listing-body .project-file-listing tbody tr").map((i, elem) => {
      const version = $("a, #file-link", elem)
        .text()
        .split("\n")[0]
        .split("+")[0];
      const uri = $("a, .button--hollow", elem).attr("href");

      // get the URL of the download button
      // const uri = $('.project-file-download-button .button').attr('href');
      links.push({
        version,
        uri
      });
    });

    const matchIfAny = links.find(link => {
      return link.version == mod.version;
    });

    // console.log('getModUrl()2', mod, nPages, pageNo);

    if (matchIfAny) {
      downloadUrl = getUrl(modsBase, matchIfAny.uri);
    } else {
      // if no match, try checking the next page
      if (pageNo != nPages) {
        // check the next page
        return await getModUrl(mod, nPages, pageNo + 1);
      }

      // else
      // no more work left to be done, mod not found.
      return null;
    }
  }

  // follow the redirect to the actual CDN download link
  if (!downloadUrl) {
    return;
  }

  const downloadPageUrl = (await httpsGet(downloadUrl)).responseUrl;

  return await getCdnUrlFromDownloadUrl(downloadPageUrl);
}

app.get("/mods", async (req, res) => {
  /*
    const promises = mods.map(mod => getModUrl(mod));
    const promiseAll = Promise.all(promises);
    try {
        const links = await promiseAll;
        res.send(links.join("\r\n"));
    } catch (err) {
        console.error(err);
        res.status(500).send(err);
    }
    */
  let hasError = false;
  let errors = [];
  const links = [];
  for (let i = 0; i < mods.length; i++) {
    let mod = mods[i];
    // const link = await getModUrl(mods[i]);
    try {
      let link = await getModUrl(mod);
      links.push(link);
    } catch (err) {
      console.error(`ERROR fetching mod: ${mod.name}`);
      console.error(err);

      let captchaError;
      captchaError = {};
      captchaError = {
        options: err.options,
        cause: err.cause,
        response: err.response,
        errorType: err.errorType,
        errorTypeDocumentation: `0 if request to page failed due to some native reason as bad url, http connection or so. error in this case will be error event
1 Cloudflare returned CAPTCHA. Nothing to do here. Bad luck
2 Cloudflare returned page with some inner error. error will be Number within this range 1012, 1011, 1002, 1000, 1004, 1010, 1006, 1007, 1008. See more here
3 this error is returned when library failed to parse and solve js challenge. error will be String with some details. ⚠️ ⚠️ Most likely it means that Cloudflare have changed their js challenge.
4 CF went into a loop and started to return challenge after challenge. If number of solved challenges is greater than 3 and another challenge is returned, throw an error
See: https://github.com/codemanki/cloudscraper/blob/HEAD/errors.js`
      };

      errors.push({ mod, err, captchaError });
      hasError = true;
    }
  }
  if (hasError) {
    res.status(500).send(errors);
  } else {
    res.send(links.join("\r\n"));
  }
});
