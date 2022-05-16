import * as utils from '@iobroker/adapter-core';

class PvPowerConrol extends utils.Adapter {

    private watchdogInterval!: ioBroker.Interval ; //Intervall für Abfrage des Smatmeters und steuern der Wallbox
    private startTimer!: ioBroker.Timeout; //Timer für Start der PV Ladung
    private stopTimer!: ioBroker.Timeout; //Timer für Stop der PV Ladung
    private gridFactor = 1; //Smatmeter factor zum umrechenen
    private currentPower = 0; //Strom einspeisung oder bezug?
    private isPluged = false; //Auto angeschlossen?
    private vehicleSoc = 0; //Ladesatnd des Autos
    private stepAmpereWallbox = 1; //Mindestampere für eine Ampere hochschalten an der Wallbox
    private wallboxAmpere = 0; //Aktuelle Ampereleistung Wallbox
    private wallboxEnable = false; //Aktuellen Wallboxstatus
    private minWallboxAmpere = 2 // Mindestampere zum Laden;
    private maxWallboxAmpere = 32 // MaximalAmpere für Wallbox
    private mode ='stop' // stop = Keine Ladung erfolgt, start=warten auf start, pv = Sind m PV Lademodus

    private stopTime = 5000; //Timer bis Laden beendet wird
    private startTime = 15000; //Timer bis LAden gestartet wird
    private intervalTime = 10000; //Intervall wie häufig der LAdestrom angepasst wird

    private runStopTimer = false;
    private runStartTimer = false;


    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'pv-power-control',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
        let tmpLoadError = false
        /**Genreal */
        if (this.config.intervall > 0) {
            this.intervalTime = this.config.intervall;
        } else {
            this.log.error('Wrong intervall time');
            tmpLoadError = true;
        }

        if (this.config.start_time > 0 && this.config.start_time < 3600) {
            this.startTime = this.config.start_time;
        } else {
            this.log.error('Wrong starttimer time: ' + this.config.start_time.toString());
            tmpLoadError = true;
        }

        if (this.config.stop_time > 0 && this.config.stop_time < 3600) {
            this.stopTime = this.config.stop_time;
        } else {
            this.log.error('Wrong stoptimer time: ' + this.config.stop_time.toString());
            tmpLoadError = true;
        }

        /** Grid */
        if (this.config.grid_factor != 0) {
            this.gridFactor = this.config.grid_factor;
        } else {
            this.log.error('Wrong grid factor:' + this.config.grid_factor.toString());
            tmpLoadError = true;
        }

        if (this.config.grid_id != '') {
            this.subscribeForeignStatesAsync(this.config.grid_id);
        } else {
            this.log.error('Wrong grid id - no Samrtmeter found');
            tmpLoadError = true;
        }

        /** Wallbox */
        //Prüfen ob wir Wallboxstatus haben
        if (this.config.wallbox_enable_id != '') {
            //Subscribe für Änderungen
            this.subscribeForeignStatesAsync(this.config.wallbox_enable_id);
            //holen den aktuellen status
            const tmpState = await this.getStateAsync(this.config.wallbox_enable_id);
            this.wallboxEnable = tmpState?.val ? true : false;
        } else {
            this.log.error('Wrong wallbox status id - no boolean found');
            tmpLoadError = true;
        }

        //Prüfen ob wir Wallbox ampere haben
        if (this.config.wallbox_ampere_id != '') {
            //Subscribe für Änderungen
            this.subscribeForeignStatesAsync(this.config.wallbox_ampere_id);
            //holen den aktuellen status
            const tmpState = await this.getForeignStateAsync(this.config.wallbox_ampere_id);
            this.wallboxAmpere = Number(tmpState?.val);
        } else {
            this.log.error('Wrong wallbox ampere id - no number found');
            tmpLoadError = true;
        }

        if (this.config.wallbox_ampere_step > 0) {
            this.stepAmpereWallbox = this.config.wallbox_ampere_step;
        } else {
            this.log.error('Wrong wallbox ampere step:' + this.config.wallbox_ampere_step.toString());
            tmpLoadError = true;
        }

        if (this.config.wallbox_ampere_max > 0) {
            this.maxWallboxAmpere = this.config.wallbox_ampere_max;
        } else {
            this.log.error('Wrong wallbox max ampere :' + this.config.wallbox_ampere_max.toString());
            tmpLoadError = true;
        }

        if (this.config.wallbox_ampere_min > 0) {
            this.minWallboxAmpere = this.config.wallbox_ampere_min;
        } else {
            this.log.error('Wrong wallbox max ampere :' + this.config.wallbox_ampere_min.toString());
            tmpLoadError = true;
        }

        /** Vehicle */
        //Prüfen ob wir Autosstatus haben
        if (this.config.vehicle_pluged_id != '') {
            //Subscribe für Änderungen
            this.subscribeForeignStatesAsync(this.config.vehicle_pluged_id);
            //holen den aktuellen status
            const tmpState = await this.getForeignStateAsync(this.config.vehicle_pluged_id);
            this.isPluged = tmpState?.val? true: false;
        } else {
            this.log.error('Wrong vehicle pluged id - no boolean found');
            tmpLoadError = true;
        }

        if (this.config.vehicle_soc_id != '') {
            //Subscribe für Änderungen
            this.subscribeForeignStatesAsync(this.config.vehicle_soc_id);
            //holen den aktuellen status
            const tmpState = await this.getForeignStateAsync(this.config.vehicle_soc_id);
            this.vehicleSoc = Number(tmpState?.val);
        } else {
            this.log.error('Wrong vehicle SoC id - no number found');
            tmpLoadError = true;
        }

        if (!tmpLoadError) {
            this.log.info('loading complete - all data present');

            //Initial wallbox all to 0
            await this.setWallboxStateAsync(this.config.wallbox_ampere_id, 0, true);
            await this.setWallboxStateAsync(this.config.wallbox_enable_id, false, true);

            //start watchdog
            this.watchdogInterval = this.setInterval(async ()=> {
                this.log.debug('Check Intervall tick');
                await this.checkPvControl();
            }, this.intervalTime * 1000);
        } else {
            this.log.info('loading incomplete - mising data');
        }
    }

    private onUnload(callback: () => void): void {
        try {
            clearTimeout(this.stopTimer);
            clearTimeout(this.startTimer);

            clearInterval(this.watchdogInterval);
            callback();
        } catch (e) {
            callback();
        }
    }

    private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
        if (state) {
            switch(id) {
                case this.config.grid_id:
                    this.log.debug('New value for grid:' + state.val?.toString());
                    await this.setGridValue(state.val)
                    break;
                case this.config.vehicle_pluged_id:
                    this.log.debug('Vehicle pluged:' + state.val?.toString());
                    this.isPluged = state.val ? true : false
                    break;
                case this.config.vehicle_soc_id:
                    this.log.debug('Vehicle soc:' + state.val?.toString());
                    this.vehicleSoc = state.val != null? +state.val : 0
                    break;
                case this.config.wallbox_ampere_id:
                    this.log.debug('Wallbox ampere:' + state.val?.toString());
                    this.wallboxAmpere = state.val != null? +state.val : 0
                    break;
                case this.config.wallbox_enable_id:
                    this.log.debug('Wallbox enable:' + state.val?.toString());
                    this.wallboxEnable = state.val ? true: false;
                    break;
                default:
                    this.log.error('No supported event found');
                    this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
            }
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }

    private async setGridValue(power: ioBroker.StateValue): Promise<void> {
        if(power != null) {
            this.currentPower = +power * this.gridFactor
            this.setStateAsync('information.currentGridPower', this.currentPower, true);
        } else {
            this.currentPower = 0;
        }

        this.log.debug('currentPower:' + this.currentPower.toString());
    }

    private async setWallbox(ampere: number): Promise<void> {
        //this.wallboxWatt = this.wallboxWatt + watt;
        //this.wallboxAmpere = Math.floor(this.wallboxAmpere + ampere);
        const tmpNewAmpere = this.wallboxAmpere + ampere;
        this.log.debug('New value: ' + this.wallboxAmpere);

        if (tmpNewAmpere >= this.minWallboxAmpere) {
            if (tmpNewAmpere >= this.maxWallboxAmpere) {
                this.log.debug('More power as the max Wallbox, set to maxAmpere from Wallbox');
                await this.setWallboxStateAsync(this.config.wallbox_ampere_id, this.maxWallboxAmpere, true);
                await this.setWallboxStateAsync(this.config.wallbox_enable_id, true, true);

                this.wallboxAmpere = this.maxWallboxAmpere; // todo aufechte werte holen
            } else {
                this.log.debug('Set New Ampere to Wallbox: ' + tmpNewAmpere.toString());
                await this.setWallboxStateAsync(this.config.wallbox_ampere_id, tmpNewAmpere, true);
                await this.setWallboxStateAsync(this.config.wallbox_enable_id, true, true);

                this.wallboxAmpere = tmpNewAmpere; // todo aufechte werte holen
            }
        } else {
            // Haben zu wenig leistung, auf minumum gehen und stopTimer starten
            if(this.wallboxAmpere != this.minWallboxAmpere) {
                await this.setWallboxStateAsync(this.config.wallbox_ampere_id, this.minWallboxAmpere, true);
                await this.setWallboxStateAsync(this.config.wallbox_enable_id, true, true);
                this.wallboxAmpere = this.minWallboxAmpere; // todo aufechte werte holen
            }
            //stop all after timer
            this.checkStopTimer();
        }
    }

    private async checkPvControl():Promise<void> {
        //Prüfen ob das Auto bereit ist
        if(this.isPluged && this.vehicleSoc < 100) {
            this.log.debug('vehicle ready check PV Power');


            //Sind wir im PV Modus?
            if (this.mode == 'PV') {
                //PV Modus - Laden das Auto dynamisch
                //this.log.warn(((this.getAmpereFromWatt(this.currentPower)/this.stepAmpereWallbox) * this.stepAmpereWallbox).toString());
                //this.log.warn((Math.floor(this.getAmpereFromWatt(this.currentPower)/this.stepAmpereWallbox) * this.stepAmpereWallbox).toString());
                const tmpWallboxAmpere = Math.floor(this.getAmpereFromWatt(this.currentPower)/this.stepAmpereWallbox) * this.stepAmpereWallbox;

                if(this.getAmpereFromWatt(this.currentPower) > this.stepAmpereWallbox) {
                    // Haben genügend Energie für eine Wallboxstep
                    this.log.debug('Have enough power - set Wallbox : ' + tmpWallboxAmpere.toString());
                    await this.setWallbox(tmpWallboxAmpere);
                } else {
                    // leider nicht genügend für ein Step - aber ist Netzbezug schon?
                    if(this.currentPower < 0) {
                        //Setze Wallbox niedriger
                        this.log.debug('Have not enough power - set Wallbox down: ' + tmpWallboxAmpere.toString());
                        await this.setWallbox(tmpWallboxAmpere);
                    } else {
                        // Kein Netzbezug, können so laufen lassen
                        this.log.debug('Have not enough power to increase wallbox');
                    }
                }
            } else {
                // Laden noch nicht - sind im Timer?
                if(this.getAmpereFromWatt(this.currentPower) > this.minWallboxAmpere) {
                    // Haben genügend Energie für eine Wallboxstep
                    this.log.debug('Have enough power to start');
                    this.checkStartTimer();
                } else {
                    // nicht genügend Energie, also wieder aus
                    this.log.debug('Have not enough power');
                    if (this.mode != 'stop') {
                        this.checkStopTimer();
                    }
                }
            }
        } else {
            this.log.debug('vehicle not ready or full charged - stop all');
            if(this.mode== 'PV') {
                await this.stopPV();
            }
        }
    }

    private checkStartTimer(): void{
        this.log.debug('check Start timer is ready');
        if (this.runStopTimer) {
            this.log.info('Stop Stoptimer - enough power');
            clearTimeout(this.stopTimer)
            this.runStopTimer = false ;
        }
        if(!this.runStartTimer) {
            this.log.info('Start Starttimer - enough power');
            this.startTimer = this.setTimeout(async () => {
                this.log.debug('Start timer finished');
                await this.startPV()
                this.runStartTimer = false;
            }, this.startTime);
            this.runStartTimer = true;
        }
    }

    private checkStopTimer(): void{
        this.log.debug('check Stop timer is ready');
        if (this.runStartTimer) {
            this.log.info('Stop Starttimer - not enough power');
            clearTimeout(this.startTimer)
            this.runStartTimer = false;
        }

        if(!this.runStopTimer) {
            this.log.info('Start Stoptimer - not enough power');
            this.stopTimer = this.setTimeout(async () => {
                this.log.debug('Stop timer finished');
                await this.stopPV()
                this.runStopTimer = false;
            }, this.stopTime);
            this.runStopTimer = true;
        }
    }

    private async startPV(): Promise<void> {
        await this.setMode('PV');
    }

    private async stopPV(): Promise<void> {
        await this.setMode('stop');
        // Stoppen Wallbox
        await this.setWallboxStateAsync(this.config.wallbox_ampere_id, 0, true);
        await this.setWallboxStateAsync(this.config.wallbox_enable_id, false, true);
        this.wallboxAmpere = 0; // todo aufechte werte holen
    }

    private async setMode(mode: string): Promise<void> {
        this.mode = mode;
        await this.setStateAsync('information.mode', mode, true);
    }

    private getAmpereFromWatt(watt: number): number{
        return watt/230;
    }

    private getWattFromAmpere(ampere: number): number {
        return ampere * 230;
    }

    private async setWallboxStateAsync(id: string, value: string | boolean | number, ack = true): Promise<void> {

        await this.setForeignStateAsync(id, value, ack);
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new PvPowerConrol(options);
} else {
    // otherwise start the instance directly
    (() => new PvPowerConrol())();
}