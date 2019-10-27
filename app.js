// const express = require('express');
// const helmet = require('helmet');
const cheerio = require('cheerio');
const axios = require('axios');
const cloudflarescraper = require('cloudscraper');
const fs = require('fs');
const requestModule = require('request');
const helmet = require('helmet');
const express = require('express');

const http = require('follow-redirects').http;
const https = require('follow-redirects').https;

const serverBase = 'https://www.feed-the-beast.com';
const filesUrl = `${serverBase}/projects/ftb-revelation/files`;

/* Consts */
// const cdnUrlBase = 'https://media.forgecdn.net/files/2804/30/jei-1.14.4-6.0.0.18.jar';
const cdnUrlBase = 'https://media.forgecdn.net/files/'; // "currying": this string is incomplete, needs the IDs and filename.

/* Utils */
async function getPage(url) {
    var options = {
        uri: url,
        headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; rv:68.0) Gecko/20100101 Firefox/68.0',
        'Accept': '*/*'},
        jar: requestModule.jar()
    };
    const response = await cloudflarescraper.defaults().get(options);
    const buffer = new Buffer.from(response,'binary');
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

/* Scrapers */
// https://www.feed-the-beast.com/projects/ftb-revelation/files/2712061 (FTBRevelation-3.0.1-1.12.2.zip)
// Eldcerust note: Update requested to version FTB Revelation 3.2.0
// gets a specific frozen version of FTB Revelation
async function getFtbRevelation() {
    let $ = cheerio.load(await getPage('https://www.feed-the-beast.com/projects/ftb-revelation/files/2778975'));

    // get the download link
    const uri = $('.project-file-download-button-large .button').attr('href');
    const downloadUrl = getUrl(serverBase, uri);

    // get the CDN URL (after a HTTP redirect)
    const cdnUrl = (await httpsGet(downloadUrl)).responseUrl;
    return cdnUrl;
}
// https://www.curseforge.com/minecraft/mc-mods/mcjtylib/files/all
const modsProjects = 'https://www.curseforge.com/minecraft/mc-mods/';
const modsBase = 'https://www.curseforge.com';
const mods = [
    { name: 'mcjtylib', version: 'McJtyLib - 1.12-3.5.4' },
    { name: 'rftools', version: 'RFTools - 1.12-7.72' },
    { name: 'plustic', version: 'plustic-7.1.6.1.jar' },
    { name: 'randompatches', version: 'RandomPatches 1.12.2-1.19.1.1' },
    { name: 'mouse-tweaks', version: '[1.12.2] Mouse Tweaks 2.10' },
    { name: 'rftools-dimensions', version: 'RFToolsDimensions - 1.12-5.71' },
    { name: 'energy-converters', version: 'energyconverters_1.12.2-1.3.3.19.jar' },
    { name: 'chicken-chunks-1-8', version: 'Chicken Chunks 1.12.2-2.4.2.74-universal' },
    { name: 'compact-machines', version: 'compactmachines3-1.12.2-3.0.18-b278.jar' },
    { name: 'tiquality', version: 'Tiquality-FAT-1.12.2-GAMMA-1.7.2.jar' }
    // { name: 'mekanism' }




];

async function getModUrl(mod, nPages, pageNo = 1) {
    // console.log('getModUrl()', mod, nPages, pageNo);
    // console.log('getModUrl()', mod.name);
    const url = `${modsProjects}${mod.name}${mod.version ? `/files/all?page=${pageNo}` : ''}`;
    // console.log(url);
    const $ = cheerio.load(await getPage(url));
    // console.log(`Got page for ${mod}`);

    let downloadUrl;
    if (!mod.version) {
        // console.log('Version not set. Going to get the latest version instead');
        // TODO not fixed for Curse's last update
        downloadUrl = getUrl(modsBase, $('.categories-container a').attr('href'));
    } else {
        const links = [];

        // console.log(`We have ${nPages} pages`);

        // get the number of pages (for checking at the tail of the recursive call if we've reached the end of the list)
        if (!nPages) {
            let items = []
            $('.ml-auto .pagination-top').map((i, elem) => {
                const x = $('a',elem);
                // console.log(x.attr('href'));
                // console.log(x.html())
                items.push(x.attr('href'));
            });

            let max = -1;
            items.map(entry => {
                const parts = entry.split('page=');
                const pageNo = parseInt(parts[parts.length - 1]);
                if (pageNo > max) {
                    max = pageNo;
                }
            });

            nPages = max;
            // console.log(`Got ${nPages} pages`);
        }

        $('.listing-body .project-file-listing tbody tr')
            .map((i, elem) => {
                const version = $('a, #file-link', elem).text().split('\n')[0].split('+')[0];
                const uri = $('a, .button--hollow',elem).attr('href');

                // get the URL of the download button
                // const uri = $('.project-file-download-button .button').attr('href');
                links.push({
                    version,
                    uri
                });
            })

        const matchIfAny = links.find(link => {
            return link.version == mod.version
        });

        // console.log('getModUrl()2', mod, nPages, pageNo);

        if (matchIfAny) {
            downloadUrl = getUrl(modsBase, matchIfAny.uri)
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
    function getCdnUrl(downloadPageUrl) {
        const idUnified = downloadPageUrl.split('/').pop();    // last part of URL, assumption: no params (?a=b&c=d)

        return `${cdnUrlBase}${getIdUri(idUnified)}/TODO.jar`
    }
    // console.log(cdnUrl);
    // return cdnUrl;

    return getCdnUrl(downloadPageUrl);
}

const app = express();
app.use(helmet());

app.get('/', async (req, res) => {
    res.send(await getFtbRevelation());
})

app.get('/mods', async (req, res) => {
    const promises = mods.map(mod => getModUrl(mod));
    const promiseAll = Promise.all(promises);
    const links = await promiseAll;

    // const links = [];
    // for (let i = 0; i < mods.length; i++) {
    //     const link = await getModUrl(mods[i]);
    //     links.push(link);
    // }

    res.send(links.join('\r\n'));
})

const port = process.env.PORT || 3000;
app.listen(port);
