// const express = require('express');
// const helmet = require('helmet');
const axios = require("axios");
const helmet = require("helmet");
const express = require("express");


/* Consts */
const cdnUrlBase = "https://media.forgecdn.net/files/"; // "currying": this string is incomplete, needs the IDs and filename.

/* Scrapers */
// https://www.feed-the-beast.com/projects/ftb-revelation/files/2712061 (FTBRevelation-3.0.1-1.12.2.zip)
// Eldcerust note: Update requested to version FTB Revelation 3.2.0
// gets a specific frozen version of FTB Revelation
async function getFtbRevelation() {
  return "https://media.forgecdn.net/files/2778/975/FTBRevelationServer_3.2.0.zip";
}

// const modsProjects = 'https://www.curseforge.com/minecraft/mc-mods/';
// const modsBase = 'https://www.curseforge.com';
// const mods = [
//     { name: 'plustic', version: 'plustic-7.1.6.1.jar' },
//     // { name: 'randompatches', version: 'RandomPatches 1.12.2-1.19.1.1' },
//     /*
//     { name: 'mouse-tweaks', version: '[1.12.2] Mouse Tweaks 2.10' },
//     { name: 'energy-converters', version: 'energyconverters_1.12.2-1.3.3.19.jar' },
//     { name: 'flux-networks', version: 'Flux-Networks-1.12.2-4.0.14' },
//     { name: 'laggoggles', version: 'LagGoggles-FAT-1.12.2-4.9.jar' },
//     { name: 'randompatches', version: 'RandomPatches 1.12.2-1.20.1.0' }
//     */
// ];

// 2020-02-28: updated to use API https://twitchappapi.docs.apiary.io/

// same format as manifest.json
// NOTE we do not used the required arg
const mods = [
  { fileID: 2789626, projectID: 260327, required: true } // plustic-7.1.6.1.jar
];

async function getPage(url) {
  console.log(`Fetching page: ${url}`);

  const response = await axios.get(url, {
    responseType: "arraybuffer"
  });
  const buffer = new Buffer.from(response.data, "binary");
  return buffer.toString();
}

const getApiResponse = async (projectID, fileID) => {
    const url = `https://addons-ecs.forgesvc.net/api/v2/addon/${projectID}/file/${fileID}`;
    return await axios.get(url);
}

/* Main Application */
const app = express();
app.use(helmet());

app.get("/", async (req, res) => {
  res.send(await getFtbRevelation());
});

app.get("/mods", async (req, res) => {
    try {
        // const links = Promise.all(mods.map(async mod => {
        //     const { projectID, fileID } = mod;
        //     const response = getApiResponse(projectID, fileID);
        //     if (response.status != 200) {
        //         throw Error(`Error fetching mod with projectID: ${projectID} and fileID: ${fileID}, status code: ${response.status}`);
        //     } else {
        //         return response.data.downloadUrl;
        //     }
        // }));
        const promises = mods.map(async mod => {
            const { projectID, fileID } = mod;
            const response = await getApiResponse(projectID, fileID);
            if (response.status != 200) {
                const message = `Error fetching mod with projectID: ${projectID} and fileID: ${fileID}, status code: ${response.status}`; 
                console.error(message);
            } else {
                return response.data.downloadUrl;
            }
        });

        const links = await Promise.all(promises);

        res.send(links.join("\r\n"));
    } catch (e) {
        console.error(e);
        res.status(500).send(e);
    }
    
});

const port = process.env.PORT || 3000;
app.listen(port);
