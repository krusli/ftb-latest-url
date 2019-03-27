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
    'mcjtylib',
    'rftools',
    'plustic',
    'randompatches',
    'mouse-tweaks',
    'squake',
    'rftools-dimensions',
    'tf2-stuff-mod',
    'energy-converters'
]
async function getModUrl(mod) {
    const url = `${modsProjects}${mod}`
    let $ = cheerio.load(await getPage(url));

    const downloadUrl = getUrl(modsBase, $('.categories-container a').attr('href'));
   
    // follow the redirect to the actual CDN download link
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
    res.send(links.join('\n'));
})

const port = process.env.PORT || 8080;
app.listen(port);