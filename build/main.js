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
    this.gridFactor = 1;
    this.currentPower = 0;
    this.isPluged = false;
    this.vehicleSoc = 0;
    this.stepAmpereWallbox = 1;
    this.wallboxAmpereComplete = 0;
    this.wallboxAmpereP1 = 0;
    this.wallboxAmpereP2 = 0;
    this.wallboxAmpereP3 = 0;
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
    let tmpLoadError = false;
    if (this.config.intervall > 0) {
      this.intervalTime = this.config.intervall;
    } else {
      this.log.error("Wrong intervall time");
      tmpLoadError = true;
    }
    if (this.config.start_time > 0 && this.config.start_time < 3600) {
      this.startTime = this.config.start_time;
    } else {
      this.log.error("Wrong starttimer time: " + this.config.start_time.toString());
      tmpLoadError = true;
    }
    if (this.config.stop_time > 0 && this.config.stop_time < 3600) {
      this.stopTime = this.config.stop_time;
    } else {
      this.log.error("Wrong stoptimer time: " + this.config.stop_time.toString());
      tmpLoadError = true;
    }
    if (this.config.grid_factor != 0) {
      this.gridFactor = this.config.grid_factor;
    } else {
      this.log.error("Wrong grid factor:" + this.config.grid_factor.toString());
      tmpLoadError = true;
    }
    if (this.config.grid_id != "") {
      this.subscribeForeignStatesAsync(this.config.grid_id);
    } else {
      this.log.error("Wrong grid id - no Samrtmeter found");
      tmpLoadError = true;
    }
    if (this.config.wallbox_ampere_id_p1) {
      this.subscribeForeignStatesAsync(this.config.wallbox_ampere_id_p1);
    } else {
      this.log.error("Wrong wallbox ampere id for phase 1 - no id found");
      tmpLoadError = true;
    }
    if (this.config.wallbox_ampere_id_p2) {
      this.subscribeForeignStatesAsync(this.config.wallbox_ampere_id_p2);
    } else {
      this.log.error("Wrong wallbox ampere id for phase 2 - no id found");
      tmpLoadError = true;
    }
    if (this.config.wallbox_ampere_id_p3) {
      this.subscribeForeignStatesAsync(this.config.wallbox_ampere_id_p3);
    } else {
      this.log.error("Wrong wallbox ampere id for phase 3 - no id found");
      tmpLoadError = true;
    }
    if (this.config.wallbox_ampere_max > 0) {
      this.maxWallboxAmpere = this.config.wallbox_ampere_max;
    } else {
      this.log.error("Wrong wallbox max ampere :" + this.config.wallbox_ampere_max.toString());
      tmpLoadError = true;
    }
    if (this.config.wallbox_ampere_min > 0) {
      this.minWallboxAmpere = this.config.wallbox_ampere_min;
    } else {
      this.log.error("Wrong wallbox max ampere :" + this.config.wallbox_ampere_min.toString());
      tmpLoadError = true;
    }
    if (this.config.vehicle_pluged_id) {
      this.subscribeForeignStatesAsync(this.config.vehicle_pluged_id);
      const tmpState = await this.getForeignStateAsync(this.config.vehicle_pluged_id);
      this.isPluged = (tmpState == null ? void 0 : tmpState.val) ? true : false;
    } else {
      this.log.error("Wrong vehicle pluged id - no boolean found");
      tmpLoadError = true;
    }
    if (this.config.vehicle_soc_id) {
      this.subscribeForeignStatesAsync(this.config.vehicle_soc_id);
      const tmpState = await this.getForeignStateAsync(this.config.vehicle_soc_id);
      this.vehicleSoc = Number(tmpState == null ? void 0 : tmpState.val);
    } else {
      this.log.error("Wrong vehicle SoC id - no number found");
      tmpLoadError = true;
    }
    if (!tmpLoadError) {
      this.log.info("loading complete - all data present");
      this.subscribeStatesAsync("control.start");
      this.subscribeStatesAsync("control.stop");
      this.subscribeStatesAsync("control.refresh");
      await this.stopWallBox();
      this.watchdogInterval = this.setInterval(async () => {
        this.log.debug("Check Intervall tick");
        await this.checkPvControl();
      }, this.intervalTime * 1e3);
    } else {
      this.log.info("loading incomplete - mising data");
    }
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
  async onStateChange(id, state) {
    var _a, _b, _c;
    if (state) {
      switch (id) {
        case this.config.grid_id:
          this.log.debug("Become nvalue for - grid: " + ((_a = state.val) == null ? void 0 : _a.toString()));
          await this.setGridValue(state.val);
          break;
        case this.config.vehicle_pluged_id:
          this.log.debug("Become new value for - Vehicle pluged: " + ((_b = state.val) == null ? void 0 : _b.toString()));
          this.isPluged = state.val ? true : false;
          break;
        case this.config.vehicle_soc_id:
          this.log.debug("Become new value for - Vehicle SoC: " + ((_c = state.val) == null ? void 0 : _c.toString()));
          this.vehicleSoc = state.val != null ? +state.val : 0;
          break;
        case this.config.wallbox_ampere_id_p1:
        case this.config.wallbox_ampere_id_p2:
        case this.config.wallbox_ampere_id_p3:
          break;
        default:
          const tmpControl = id.split(".")[3];
          this.log.debug(id);
          this.log.debug(tmpControl);
          switch (tmpControl) {
            case "refresh":
              this.log.info("Forcing refresh");
              await this.checkPvControl();
              break;
            default:
              this.log.error("No supported event found");
              this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
          }
      }
    } else {
      this.log.info(`state ${id} deleted`);
    }
  }
  async setGridValue(power) {
    if (power != null) {
      this.currentPower = +power * this.gridFactor;
      this.setStateAsync("information.currentGridPower", this.currentPower, true);
    } else {
      this.currentPower = 0;
    }
    this.currentPower = this.currentPower + 5e3;
    this.log.debug("currentPower:" + this.currentPower.toString());
  }
  async stopWallBox() {
    this.wallboxAmpereP1 = 0;
    this.wallboxAmpereP2 = 0;
    this.wallboxAmpereP3 = 0;
    this.setForeignState(this.config.wallbox_ampere_id_p1, this.wallboxAmpereP1);
    this.setForeignState(this.config.wallbox_ampere_id_p2, this.wallboxAmpereP2);
    this.setForeignState(this.config.wallbox_ampere_id_p3, this.wallboxAmpereP3);
    this.wallboxAmpereComplete = this.wallboxAmpereP1 + this.wallboxAmpereP2 + this.wallboxAmpereP3;
  }
  async setWallbox(ampere) {
    let tmpChangeWallbox = false;
    const newAmpereComplete = this.wallboxAmpereComplete + ampere;
    if (newAmpereComplete >= this.maxWallboxAmpere * 3) {
      if (this.wallboxAmpereP1 < this.maxWallboxAmpere || this.wallboxAmpereP2 < this.maxWallboxAmpere || this.wallboxAmpereP3 < this.maxWallboxAmpere) {
        this.log.debug("More power as the max Wallbox, set to maxAmpere to Wallbox");
        this.wallboxAmpereP1 = this.maxWallboxAmpere;
        this.wallboxAmpereP2 = this.maxWallboxAmpere;
        this.wallboxAmpereP3 = this.maxWallboxAmpere;
        tmpChangeWallbox = true;
      } else {
        this.log.debug("More power as the max Wallbox, wallbox is on max - nothing changed");
      }
    } else {
      this.log.debug("Have New Ampere for Wallbox, add: " + ampere.toString());
      if (newAmpereComplete >= this.minWallboxAmpere * 3) {
        this.wallboxAmpereP1 = newAmpereComplete / 3;
        this.wallboxAmpereP2 = newAmpereComplete / 3;
        this.wallboxAmpereP3 = newAmpereComplete / 3;
        tmpChangeWallbox = true;
      } else {
        if (newAmpereComplete > this.maxWallboxAmpere) {
          this.wallboxAmpereP1 = this.maxWallboxAmpere;
          tmpChangeWallbox = true;
        }
        if (newAmpereComplete < this.minWallboxAmpere) {
          this.wallboxAmpereP1 = this.minWallboxAmpere;
          tmpChangeWallbox = true;
          this.checkStopTimer();
        }
        if (!tmpChangeWallbox) {
          this.wallboxAmpereP1 = newAmpereComplete;
          tmpChangeWallbox = true;
        }
        this.wallboxAmpereP2 = 0;
        this.wallboxAmpereP3 = 0;
        tmpChangeWallbox = true;
      }
    }
    if (tmpChangeWallbox) {
      this.setForeignState(this.config.wallbox_ampere_id_p1, this.wallboxAmpereP1);
      this.setForeignState(this.config.wallbox_ampere_id_p2, this.wallboxAmpereP2);
      this.setForeignState(this.config.wallbox_ampere_id_p3, this.wallboxAmpereP3);
      this.wallboxAmpereComplete = this.wallboxAmpereP1 + this.wallboxAmpereP2 + this.wallboxAmpereP3;
    }
  }
  async checkPvControl() {
    if (this.isPluged && this.vehicleSoc < 100) {
      this.log.debug("vehicle ready  - check PV Power");
      if (this.mode == "PV") {
        const tmpWallboxAmpere = Math.floor(this.getAmpereFromWatt(this.currentPower) / this.stepAmpereWallbox) * this.stepAmpereWallbox;
        if (this.getAmpereFromWatt(this.currentPower) > this.stepAmpereWallbox) {
          this.log.debug("Have enough power - set Wallbox : " + tmpWallboxAmpere.toString());
          await this.setWallbox(tmpWallboxAmpere);
        } else {
          if (this.currentPower < 0) {
            this.log.debug("Have not enough power - set Wallbox down: " + tmpWallboxAmpere.toString());
            await this.setWallbox(tmpWallboxAmpere);
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
      this.log.info("Vehicle not ready or full charged - stop all");
      if (this.mode == "PV") {
        await this.stopPV();
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
      this.startTimer = this.setTimeout(async () => {
        this.log.debug("Start timer finished");
        await this.startPV();
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
      this.stopTimer = this.setTimeout(async () => {
        this.log.debug("Stop timer finished");
        await this.stopPV();
        this.runStopTimer = false;
      }, this.stopTime);
      this.runStopTimer = true;
    }
  }
  async startPV() {
    await this.setMode("PV");
  }
  async stopPV() {
    await this.setMode("stop");
    this.stopWallBox();
  }
  async setMode(mode) {
    this.mode = mode;
    await this.setStateAsync("information.mode", mode, true);
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
