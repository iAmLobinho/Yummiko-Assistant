
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("yummiko", {
    versao: "1.0.0"
});
