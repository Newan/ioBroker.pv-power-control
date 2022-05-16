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
    this.wallboxAmpere = 0;
    this.wallboxEnable = false;
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
    if (this.config.wallbox_enable_id != "") {
      this.subscribeForeignStatesAsync(this.config.wallbox_enable_id);
      const tmpState = await this.getStateAsync(this.config.wallbox_enable_id);
      this.wallboxEnable = (tmpState == null ? void 0 : tmpState.val) ? true : false;
    } else {
      this.log.error("Wrong wallbox status id - no boolean found");
      tmpLoadError = true;
    }
    if (this.config.wallbox_ampere_id != "") {
      this.subscribeForeignStatesAsync(this.config.wallbox_ampere_id);
      const tmpState = await this.getForeignStateAsync(this.config.wallbox_ampere_id);
      this.wallboxAmpere = Number(tmpState == null ? void 0 : tmpState.val);
    } else {
      this.log.error("Wrong wallbox ampere id - no number found");
      tmpLoadError = true;
    }
    if (this.config.wallbox_ampere_step > 0) {
      this.stepAmpereWallbox = this.config.wallbox_ampere_step;
    } else {
      this.log.error("Wrong wallbox ampere step:" + this.config.wallbox_ampere_step.toString());
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
    if (this.config.vehicle_pluged_id != "") {
      this.subscribeForeignStatesAsync(this.config.vehicle_pluged_id);
      const tmpState = await this.getForeignStateAsync(this.config.vehicle_pluged_id);
      this.isPluged = (tmpState == null ? void 0 : tmpState.val) ? true : false;
    } else {
      this.log.error("Wrong vehicle pluged id - no boolean found");
      tmpLoadError = true;
    }
    if (this.config.vehicle_soc_id != "") {
      this.subscribeForeignStatesAsync(this.config.vehicle_soc_id);
      const tmpState = await this.getForeignStateAsync(this.config.vehicle_soc_id);
      this.vehicleSoc = Number(tmpState == null ? void 0 : tmpState.val);
    } else {
      this.log.error("Wrong vehicle SoC id - no number found");
      tmpLoadError = true;
    }
    if (!tmpLoadError) {
      this.log.info("loading complete - all data present");
      await this.setWallboxStateAsync(this.config.wallbox_ampere_id, 0, true);
      await this.setWallboxStateAsync(this.config.wallbox_enable_id, false, true);
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
    var _a, _b, _c, _d, _e;
    if (state) {
      switch (id) {
        case this.config.grid_id:
          this.log.debug("New value for grid:" + ((_a = state.val) == null ? void 0 : _a.toString()));
          await this.setGridValue(state.val);
          break;
        case this.config.vehicle_pluged_id:
          this.log.debug("Vehicle pluged:" + ((_b = state.val) == null ? void 0 : _b.toString()));
          this.isPluged = state.val ? true : false;
          break;
        case this.config.vehicle_soc_id:
          this.log.debug("Vehicle soc:" + ((_c = state.val) == null ? void 0 : _c.toString()));
          this.vehicleSoc = state.val != null ? +state.val : 0;
          break;
        case this.config.wallbox_ampere_id:
          this.log.debug("Wallbox ampere:" + ((_d = state.val) == null ? void 0 : _d.toString()));
          this.wallboxAmpere = state.val != null ? +state.val : 0;
          break;
        case this.config.wallbox_enable_id:
          this.log.debug("Wallbox enable:" + ((_e = state.val) == null ? void 0 : _e.toString()));
          this.wallboxEnable = state.val ? true : false;
          break;
        default:
          this.log.error("No supported event found");
          this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
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
    this.log.debug("currentPower:" + this.currentPower.toString());
  }
  async setWallbox(ampere) {
    const tmpNewAmpere = this.wallboxAmpere + ampere;
    this.log.debug("New value: " + this.wallboxAmpere);
    if (tmpNewAmpere >= this.minWallboxAmpere) {
      if (tmpNewAmpere >= this.maxWallboxAmpere) {
        this.log.debug("More power as the max Wallbox, set to maxAmpere from Wallbox");
        await this.setWallboxStateAsync(this.config.wallbox_ampere_id, this.maxWallboxAmpere, true);
        await this.setWallboxStateAsync(this.config.wallbox_enable_id, true, true);
        this.wallboxAmpere = this.maxWallboxAmpere;
      } else {
        this.log.debug("Set New Ampere to Wallbox: " + tmpNewAmpere.toString());
        await this.setWallboxStateAsync(this.config.wallbox_ampere_id, tmpNewAmpere, true);
        await this.setWallboxStateAsync(this.config.wallbox_enable_id, true, true);
        this.wallboxAmpere = tmpNewAmpere;
      }
    } else {
      if (this.wallboxAmpere != this.minWallboxAmpere) {
        await this.setWallboxStateAsync(this.config.wallbox_ampere_id, this.minWallboxAmpere, true);
        await this.setWallboxStateAsync(this.config.wallbox_enable_id, true, true);
        this.wallboxAmpere = this.minWallboxAmpere;
      }
      this.checkStopTimer();
    }
  }
  async checkPvControl() {
    if (this.isPluged && this.vehicleSoc < 100) {
      this.log.debug("vehicle ready check PV Power");
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
      this.log.debug("vehicle not ready or full charged - stop all");
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
    await this.setWallboxStateAsync(this.config.wallbox_ampere_id, 0, true);
    await this.setWallboxStateAsync(this.config.wallbox_enable_id, false, true);
    this.wallboxAmpere = 0;
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
  async setWallboxStateAsync(id, value, ack = true) {
    await this.setForeignStateAsync(id, value, ack);
  }
}
if (require.main !== module) {
  module.exports = (options) => new PvPowerConrol(options);
} else {
  (() => new PvPowerConrol())();
}
//# sourceMappingURL=main.js.map
