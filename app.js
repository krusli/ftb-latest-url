// const express = require('express');
// const helmet = require('helmet');
const cheerio = require('cheerio');
const axios = require('axios');
const helmet = require('helmet');
const express = require('express');

const http = require('follow-redirects').http;
const https = require('follow-redirects').https;

const serverBase = 'https://www.feed-the-beast.com';
const filesUrl = `${serverBase}/projects/ftb-revelation/files`;

/* Utils */
async function getPage(url) {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = new Buffer.from(response.data, 'binary');
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
// just get the latest one
async function getLatest() {
    let $ = cheerio.load(await getPage(filesUrl));

    // get the link to the latest server files page
    const projectFiles = $('.project-file-list-item').map((i, elem) => $(elem));
    const latest = projectFiles[0];

    $ = cheerio.load(latest.html());
    const latestServerPageUrl = getUrl(serverBase, $('.more-files-tag').attr('href'));

    // get the download link
    $ = cheerio.load(await getPage(latestServerPageUrl));
    const downloadUrl = getUrl(serverBase, $('.button.tip').attr('href'));

    // follow the redirect to the actual CDN download link
    const cdnUrl = (await httpsGet(downloadUrl)).responseUrl;
    return cdnUrl;
}

// https://www.feed-the-beast.com/projects/ftb-revelation/files/2712061 (FTBRevelation-3.0.1-1.12.2.zip)
// gets a specific frozen version of FTB Revelation
async function getFtbRevelation() {
  let $ = cheerio.load(await getPage('https://www.feed-the-beast.com/projects/ftb-revelation/files/2712061'));

  // get the download link
  const uri = $('.project-file-download-button-large .button').attr('href');
  const downloadUrl = getUrl(serverBase, uri);

  // get the CDN URL (after a HTTP redirect)
  const cdnUrl = (await httpsGet(downloadUrl)).responseUrl; 
  return cdnUrl;
}

const modsProjects = 'https://minecraft.curseforge.com/projects/';
const modsBase = 'https://minecraft.curseforge.com/';
const mods = [
    { name: 'mcjtylib', version: 'McJtyLib - 1.12-3.5.3' },
    { name: 'rftools', version: 'RFTools - 1.12-7.71' },
    { name: 'plustic', version: 'plustic-7.0.7.0.jar' },
    { name: 'randompatches', version: 'RandomPatches 1.12.2-1.15.1.0' },
    { name: 'mouse-tweaks', version: '[1.12.2] Mouse Tweaks 2.10' },
    { name: 'squake', version: 'Squake-mc1.12.2-1.0.6.jar' },
    { name: 'rftools-dimensions', version: 'RFToolsDimensions - 1.12-5.71' },
    { name: 'tf2-stuff-mod', version: 'rafradek_tf2_weapons-1.12.2-1.5.12.jar' },
    { name: 'energy-converters', version: 'energyconverters_1.12.2-1.3.0.15.jar' },
    // { name: 'mekanism' }
];

async function getModUrl(mod, nPages, pageNo=1) {
    console.log('getModUrl()', mod, nPages, pageNo);
    const url = `${modsProjects}${mod.name}${mod.version ? `/files?page=${pageNo}` : ''}`;
    const $ = cheerio.load(await getPage(url));

    let downloadUrl;
    if (!mod.version) {
        downloadUrl = getUrl(modsBase, $('.categories-container a').attr('href'));
    } else {
        const links = [];

        // get the number of pages (for checking at the tail of the recursive call if we've reached the end of the list)
        if (!nPages) {
            let items = []
            $('.listing-header .b-pagination-item a').map((i, elem) => {
                const x = $(elem);
                items.push(x.attr('href'))
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
        }
        
        $('.listing-body .project-file-list-item')
        .map((i, elem) => {
            const linkElem = $('.twitch-link', elem);
            const version = linkElem.html();

            // get the URL of the download button
            const uri = $('.project-file-download-button .button').attr('href');
            links.push({
                version,
                uri
            });
        })

        const matchIfAny = links.find(link => {
            return link.version == mod.version
        });

        if (matchIfAny) {
            downloadUrl = getUrl(modsBase, matchIfAny.uri)
        } else {
            // if no match, try checking the next page
            if (pageNo != nPages) {
                // check the next page
                return await getModUrl(mod, nPages, pageNo+1);
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
    const cdnUrl = (await httpsGet(downloadUrl)).responseUrl;
    return cdnUrl;
}

const app = express();
app.use(helmet());

app.get('/', async (req, res) => {
    // res.send(await getLatest());
    res.send(await getFtbRevelation());
})

app.get('/mods', async (req, res) => {
    const promises = mods.map(mod => getModUrl(mod));
    const promiseAll = Promise.all(promises);
    const links = await promiseAll;

    res.send(links.join('\r\n'));
})

app.get('/mods-debug', async (req, res) => {
    const promises = mods.map(mod => getModUrl(mod));
    const promiseAll = Promise.all(promises);
    const links = await promiseAll;

    res.json(links);
})

const port = process.env.PORT || 3000;
app.listen(port);
