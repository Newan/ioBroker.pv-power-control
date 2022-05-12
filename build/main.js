var __create = Object.create;
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target, mod));
var utils = __toESM(require("@iobroker/adapter-core"));
class PvPowerConrol extends utils.Adapter {
  constructor(options = {}) {
    super(__spreadProps(__spreadValues({}, options), {
      name: "pv-power-control"
    }));
    this.powerFactor = 1;
    this.currentPower = 0;
    this.isPluged = false;
    this.vehicleSoc = 0;
    this.stepAmpereWallbox = 1;
    this.wallboxAmpere = 0;
    this.wallboxWatt = 0;
    this.minWallboxAmpere = 2;
    this.maxWallboxAmpere = 32;
    this.mode = "stop";
    this.stopTime = 5e3;
    this.startTime = 15e3;
    this.intervalTime = 1e4;
    this.runStopTimer = false;
    this.runStartTimer = false;
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onReady() {
    this.subscribeForeignStatesAsync("0_userdata.0.grid");
    this.subscribeForeignStatesAsync("0_userdata.0.wallbox_enable");
    this.subscribeForeignStatesAsync("0_userdata.0.wallbox_power");
    this.getForeignStateAsync("0_userdata.0.vehicle_pluged").then((result) => {
      if (result != null) {
        this.isPluged = Boolean(result);
      } else {
        this.isPluged = false;
      }
    });
    this.subscribeForeignStatesAsync("0_userdata.0.vehicle_pluged");
    this.subscribeForeignStatesAsync("0_userdata.0.vehicle_soc");
    this.setForeignStateAsync("0_userdata.0.wallbox_power", 0, true);
    this.setForeignStateAsync("0_userdata.0.wallbox_ampere", 0, true);
    this.setForeignStateAsync("0_userdata.0.wallbox_enable", false, true);
    this.watchdogInterval = this.setInterval(() => {
      this.log.debug("Check Intervall tick");
      this.checkPvControl();
    }, this.intervalTime);
  }
  onUnload(callback) {
    try {
      clearTimeout(this.stopTimer);
      clearTimeout(this.startTimer);
      clearInterval(this.watchdogInterval);
      callback();
    } catch (e) {
      callback();
    }
  }
  onStateChange(id, state) {
    var _a, _b, _c, _d, _e;
    if (state) {
      switch (id) {
        case "0_userdata.0.grid":
          this.log.debug("New value for grid:" + ((_a = state.val) == null ? void 0 : _a.toString()));
          this.setGridValue(state.val);
          break;
        case "0_userdata.0.vehicle_pluged":
          this.log.debug("Vehicle pluged:" + ((_b = state.val) == null ? void 0 : _b.toString()));
          this.isPluged = state.val ? true : false;
          break;
        case "0_userdata.0.vehicle_soc":
          this.log.debug("Vehicle soc:" + ((_c = state.val) == null ? void 0 : _c.toString()));
          this.vehicleSoc = state.val != null ? +state.val : 0;
          break;
        case "0_userdata.0.wallbox_power":
          this.log.debug("Wallbox power new:" + ((_d = state.val) == null ? void 0 : _d.toString()));
          this.wallboxWatt = state.val != null ? +state.val : 0;
          break;
        case "0_userdata.0.wallbox_ampere":
          this.log.debug("Wallbox ampere new:" + ((_e = state.val) == null ? void 0 : _e.toString()));
          this.wallboxAmpere = state.val != null ? +state.val : 0;
          break;
        default:
          this.log.error("No supported event found");
          this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
      }
    } else {
      this.log.info(`state ${id} deleted`);
    }
  }
  setGridValue(power) {
    if (power != null) {
      this.currentPower = +power * this.powerFactor;
    } else {
      this.currentPower = 0;
    }
    this.log.debug("currentPower:" + this.currentPower.toString());
  }
  setWallbox(ampere) {
    const tmpNewAmpere = this.wallboxAmpere + ampere;
    this.log.debug("New value: " + this.wallboxAmpere);
    if (tmpNewAmpere >= this.minWallboxAmpere) {
      if (tmpNewAmpere >= this.maxWallboxAmpere) {
        this.log.debug("More power as the max Wallbox, set to maxAmpere from Wallbox");
        this.setForeignStateAsync("0_userdata.0.wallbox_power", this.getWattFromAmpere(this.maxWallboxAmpere), true);
        this.setForeignStateAsync("0_userdata.0.wallbox_ampere", this.maxWallboxAmpere, true);
        this.setForeignStateAsync("0_userdata.0.wallbox_enable", true, true);
        this.wallboxAmpere = this.maxWallboxAmpere;
      } else {
        this.log.debug("Set New Ampere to Wallbox: " + tmpNewAmpere.toString());
        this.setForeignStateAsync("0_userdata.0.wallbox_power", this.getWattFromAmpere(tmpNewAmpere), true);
        this.setForeignStateAsync("0_userdata.0.wallbox_ampere", tmpNewAmpere, true);
        this.setForeignStateAsync("0_userdata.0.wallbox_enable", true, true);
        this.wallboxAmpere = tmpNewAmpere;
      }
    } else {
      if (this.wallboxAmpere != this.minWallboxAmpere) {
        this.setForeignStateAsync("0_userdata.0.wallbox_power", this.getWattFromAmpere(this.minWallboxAmpere), true);
        this.setForeignStateAsync("0_userdata.0.wallbox_ampere", this.minWallboxAmpere, true);
        this.setForeignStateAsync("0_userdata.0.wallbox_enable", true, true);
        this.wallboxAmpere = this.minWallboxAmpere;
      }
      this.checkStopTimer();
    }
  }
  checkPvControl() {
    if (this.isPluged && this.vehicleSoc < 100) {
      this.log.debug("vehicle ready check PV Power");
      if (this.mode == "PV") {
        const tmpWallboxAmpere = Math.floor(this.getAmpereFromWatt(this.currentPower) / this.stepAmpereWallbox) * this.stepAmpereWallbox;
        if (this.getAmpereFromWatt(this.currentPower) > this.stepAmpereWallbox) {
          this.log.debug("Have enough power - set Wallbox : " + tmpWallboxAmpere.toString());
          this.setWallbox(tmpWallboxAmpere);
        } else {
          if (this.currentPower < 0) {
            this.log.debug("Have not enough power - set Wallbox down: " + tmpWallboxAmpere.toString());
            this.setWallbox(tmpWallboxAmpere);
          } else {
            this.log.debug("Have not enough power to increase wallbox");
          }
        }
      } else {
        if (this.getAmpereFromWatt(this.currentPower) > this.minWallboxAmpere) {
          this.log.debug("Have enough power to start");
          this.checkStartTimer();
        } else {
          this.log.debug("Have not enough power");
          if (this.mode != "stop") {
            this.checkStopTimer();
          }
        }
      }
    } else {
      this.log.debug("vehicle not ready or full charged - stop all");
      if (this.mode == "PV") {
        this.stopPV();
      }
    }
  }
  checkStartTimer() {
    this.log.debug("check Start timer is ready");
    if (this.runStopTimer) {
      this.log.info("Stop Stoptimer - enough power");
      clearTimeout(this.stopTimer);
      this.runStopTimer = false;
    }
    if (!this.runStartTimer) {
      this.log.info("Start Starttimer - enough power");
      this.startTimer = this.setTimeout(() => {
        this.log.debug("Start timer finished");
        this.startPV();
        this.runStartTimer = false;
      }, this.startTime);
      this.runStartTimer = true;
    }
  }
  checkStopTimer() {
    this.log.debug("check Stop timer is ready");
    if (this.runStartTimer) {
      this.log.info("Stop Starttimer - not enough power");
      clearTimeout(this.startTimer);
      this.runStartTimer = false;
    }
    if (!this.runStopTimer) {
      this.log.info("Start Stoptimer - not enough power");
      this.stopTimer = this.setTimeout(() => {
        this.log.debug("Stop timer finished");
        this.stopPV();
        this.runStopTimer = false;
      }, this.stopTime);
      this.runStopTimer = true;
    }
  }
  startPV() {
    this.mode = "PV";
  }
  stopPV() {
    this.mode = "stop";
    this.setForeignStateAsync("0_userdata.0.wallbox_power", 0, true);
    this.setForeignStateAsync("0_userdata.0.wallbox_ampere", 0, true);
    this.setForeignStateAsync("0_userdata.0.wallbox_enable", false, true);
    this.wallboxAmpere = 0;
  }
  getAmpereFromWatt(watt) {
    return watt / 230;
  }
  getWattFromAmpere(ampere) {
    return ampere * 230;
  }
}
if (require.main !== module) {
  module.exports = (options) => new PvPowerConrol(options);
} else {
  (() => new PvPowerConrol())();
}
//# sourceMappingURL=main.js.map
