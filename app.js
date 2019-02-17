// const express = require('express');
// const helmet = require('helmet');
const cheerio = require('cheerio');
const axios = require('axios');
const http = require('follow-redirects').http;
const https = require('follow-redirects').https;

const base = 'https://www.feed-the-beast.com';
const filesUrl = `${base}/projects/ftb-revelation/files`;

async function getPage(url) {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = new Buffer.from(response.data, 'binary');
    return buffer.toString();
}

function getUrl(uri) {
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
    const latestServerPageUrl = getUrl($('.more-files-tag').attr('href'));

    // get the download link
    $ = cheerio.load(await getPage(latestServerPageUrl));
    const downloadUrl = getUrl($('.button.tip').attr('href'));

    // follow the redirect to the actual CDN download link
    const cdnUrl = (await httpsGet(downloadUrl)).responseUrl;
    console.log(cdnUrl);
}

getLatest();