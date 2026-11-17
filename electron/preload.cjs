'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function onChannel(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const wrapped = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld('akaneDesktop', {
  isElectron: true,
  getBridgePairing: () => ipcRenderer.invoke('akane:get-bridge-pairing'),
  pickAllowedFolder: () => ipcRenderer.invoke('akane:pick-folder'),
  setCompanionMode: (enabled) => ipcRenderer.invoke('akane:set-companion-mode', Boolean(enabled)),
  setClickThrough: (enabled) => ipcRenderer.invoke('akane:set-click-through', Boolean(enabled)),
  setStartWithWindows: (enabled) => ipcRenderer.invoke('akane:set-start-with-windows', Boolean(enabled)),
  getDesktopStatus: () => ipcRenderer.invoke('akane:get-desktop-status'),
  triggerEmergencyStop: () => ipcRenderer.invoke('akane:emergency-stop'),
  captureScreenDataUrl: () => ipcRenderer.invoke('akane:capture-screen'),
  onEmergencyStop: (cb) => onChannel('akane:emergency-stop', cb),
  onTalkShortcut: (cb) => onChannel('akane:talk-shortcut', cb),
  onDesktopStateChanged: (cb) => onChannel('akane:desktop-state', cb),
  onBridgeUpdated: (cb) => onChannel('akane:bridge-updated', cb),
});
