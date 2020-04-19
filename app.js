// const express = require('express');
// const helmet = require('helmet');
const axios = require("axios");
const helmet = require("helmet");
const express = require("express");

/* Consts */
// const cdnUrlBase = "https://media.forgecdn.net/files/"; // "currying": this string is incomplete, needs the IDs and filename.
// NOTE we now use edge.forgecdn.net too (see examples returned from API):
// https://edge.forgecdn.net/files/2789/626/plustic-7.1.6.1.jar
// https://edge.forgecdn.net/files/2671/937/MouseTweaks-2.10-mc1.12.2.jar
// https://edge.forgecdn.net/files/2796/426/energyconverters_1.12.2-1.3.3.19.jar
// https://edge.forgecdn.net/files/2842/381/fluxnetworks-1.12.2-4.0.14-31.jar
// https://edge.forgecdn.net/files/2831/330/randompatches-1.12.2-1.20.1.0.jar

async function getFtbRevelation() {
  // return "https://media.forgecdn.net/files/2778/975/FTBRevelationServer_3.2.0.zip";
  return "https://media.forgecdn.net/files/2690/320/FTB+Presents+Direwolf20+1.12-1.12.2-2.5.0-Server.zip";
}

async function getSF4() {
  return "https://media.forgecdn.net/files/2787/18/SkyFactory_4_Server_4.1.0.zip";
}

// 2020-02-28: updated to use API https://twitchappapi.docs.apiary.io/
// same format as manifest.json (without required key)
/*
const mods = [
  { projectID: 260327, fileID: 2789626 }, // plustic-7.1.6.1.jar
  { projectID: 60089, fileID: 2671937 }, // [1.12.2] Mouse Tweaks 2.10
  { projectID: 254818, fileID: 2796426 }, // energyconverters_1.12.2-1.3.3.19.jar
  { projectID: 248020, fileID: 2842381 }, // Flux-Networks-1.12.2-4.0.14
  { projectID: 285612, fileID: 2831330 }, // RandomPatches 1.12.2-1.20.1.0
  { projectID: 233105, fileID: 2660396 }, // mcjtylib-1.12-3.1.1.jar
];
*/

// 2020-04-19: DW20 build
const mods = [
  { projectID: 260327, fileID: 2789626 }, // plustic-7.1.6.1.jar
  { projectID: 254818, fileID: 2796426 }, // energyconverters_1.12.2-1.3.3.19.jar
  { projectID: 248020, fileID: 2842381 }, // Flux-Networks-1.12.2-4.0.14
  { projectID: 285612, fileID: 2831330 }, // RandomPatches 1.12.2-1.20.1.0
  { projectID: 253619, fileID: 2899820 }, // realfilingcabinet-1.12-0.2.0.21.jar
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
  // res.send(await getSF4());
});

app.get("/mods", async (req, res) => {
    try {
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
