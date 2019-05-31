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

const modsProjects = 'https://minecraft.curseforge.com/projects/';
const modsBase = 'https://minecraft.curseforge.com/';
const mods = [
    { name: 'mcjtylib' },
    { name: 'rftools', version: 'RFTools - 1.12-7.71' },
    { name: 'plustic' },
    { name: 'randompatches' },
    { name: 'mouse-tweaks' },
    { name: 'squake' },
    { name: 'rftools-dimensions' },
    { name: 'tf2-stuff-mod' },
    { name: 'energy-converters' },
    { name: 'mekanism' }
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
    res.send(await getLatest());
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
