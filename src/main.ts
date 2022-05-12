import * as utils from '@iobroker/adapter-core';

class PvPowerConrol extends utils.Adapter {

    private watchdogInterval!: ioBroker.Interval ; //Intervall für Abfrage des Smatmeters und steuern der Wallbox
    private startTimer!: ioBroker.Timeout; //Timer für Start der PV Ladung
    private stopTimer!: ioBroker.Timeout; //Timer für Stop der PV Ladung
    private powerFactor = 1; //Smatmeter factor zum umrechenen
    private currentPower = 0; //Strom einspeisung oder bezug?
    private isPluged = false; //Auto angeschlossen?
    private vehicleSoc = 0; //Ladesatnd des Autos
    private stepAmpereWallbox = 1; //Mindestampere für eine Ampere hochschalten an der Wallbox
    private wallboxAmpere = 0; //Aktuelle Ampereleistung Wallbox
    private wallboxWatt = 0; //Aktuelle Wattleistung Wallbox
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
        /** Grid */
        //Prüfen ob wir ein GRid/Smartmeter haben
        this.subscribeForeignStatesAsync('0_userdata.0.grid');

        /** Wallbox */
        //Prüfen ob wir Wallboxstatus haben
        this.subscribeForeignStatesAsync('0_userdata.0.wallbox_enable');

        //Prüfen ob wir Wallboxampere haben
        this.subscribeForeignStatesAsync('0_userdata.0.wallbox_power');

        /** Vehicle */
        //Prüfen ob wir Autosstatus haben
        this.getForeignStateAsync('0_userdata.0.vehicle_pluged').then( result => {
            if (result != null) {
                this.isPluged = Boolean(result);
            } else {
                this.isPluged = false;
            }
        })
        this.subscribeForeignStatesAsync('0_userdata.0.vehicle_pluged');

        //Prüfen ob wir SOC des Autos haben
        this.subscribeForeignStatesAsync('0_userdata.0.vehicle_soc');

        /** Control Adapter */
        //this.subscribeStates('mode_pv');
        //this.subscribeStates('stop');
        //this.subscribeStates('start_full');

        //await this.setStateAsync('testVariable', true);

        //Initial all to 0
        this.setForeignStateAsync('0_userdata.0.wallbox_power', 0, true);
        this.setForeignStateAsync('0_userdata.0.wallbox_ampere', 0, true);
        this.setForeignStateAsync('0_userdata.0.wallbox_enable', false, true);

        this.watchdogInterval = this.setInterval(()=> {
            this.log.debug('Check Intervall tick');
            this.checkPvControl();
        }, this.intervalTime);
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
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

    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        if (state) {
            switch(id) {
                case '0_userdata.0.grid':
                    this.log.debug('New value for grid:' + state.val?.toString());
                    this.setGridValue(state.val)
                    break;
                case '0_userdata.0.vehicle_pluged':
                    this.log.debug('Vehicle pluged:' + state.val?.toString());
                    this.isPluged = state.val ? true : false
                    break;
                case '0_userdata.0.vehicle_soc':
                    this.log.debug('Vehicle soc:' + state.val?.toString());
                    this.vehicleSoc = state.val != null? +state.val : 0
                    break;
                case '0_userdata.0.wallbox_power':
                    this.log.debug('Wallbox power new:' + state.val?.toString());
                    this.wallboxWatt = state.val != null? +state.val : 0
                    break;
                case '0_userdata.0.wallbox_ampere':
                    this.log.debug('Wallbox ampere new:' + state.val?.toString());
                    this.wallboxAmpere = state.val != null? +state.val : 0
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


    private setGridValue(power: ioBroker.StateValue): void {
        if(power != null) {
            this.currentPower = +power * this.powerFactor
        } else {
            this.currentPower = 0;
        }

        this.log.debug('currentPower:' + this.currentPower.toString());
    }

    private setWallbox(ampere: number): void {
        //this.wallboxWatt = this.wallboxWatt + watt;
        //this.wallboxAmpere = Math.floor(this.wallboxAmpere + ampere);
        const tmpNewAmpere = this.wallboxAmpere + ampere;
        this.log.debug('New value: ' + this.wallboxAmpere);

        if (tmpNewAmpere >= this.minWallboxAmpere) {
            if (tmpNewAmpere >= this.maxWallboxAmpere) {
                this.log.debug('More power as the max Wallbox, set to maxAmpere from Wallbox');
                this.setForeignStateAsync('0_userdata.0.wallbox_power', this.getWattFromAmpere(this.maxWallboxAmpere), true);
                this.setForeignStateAsync('0_userdata.0.wallbox_ampere', this.maxWallboxAmpere, true);
                this.setForeignStateAsync('0_userdata.0.wallbox_enable', true, true);
                this.wallboxAmpere = this.maxWallboxAmpere; // todo aufechte werte holen
            } else {
                this.log.debug('Set New Ampere to Wallbox: ' + tmpNewAmpere.toString());
                this.setForeignStateAsync('0_userdata.0.wallbox_power', this.getWattFromAmpere(tmpNewAmpere), true);
                this.setForeignStateAsync('0_userdata.0.wallbox_ampere', tmpNewAmpere, true);
                this.setForeignStateAsync('0_userdata.0.wallbox_enable', true, true);
                this.wallboxAmpere = tmpNewAmpere; // todo aufechte werte holen

            }
        } else {
            // Haben zu wenig leistung, auf minumum gehen und stopTimer starten
            if(this.wallboxAmpere != this.minWallboxAmpere) {
                this.setForeignStateAsync('0_userdata.0.wallbox_power', this.getWattFromAmpere(this.minWallboxAmpere), true);
                this.setForeignStateAsync('0_userdata.0.wallbox_ampere', this.minWallboxAmpere, true);
                this.setForeignStateAsync('0_userdata.0.wallbox_enable', true, true);
                this.wallboxAmpere = this.minWallboxAmpere; // todo aufechte werte holen
            }
            //stop all after timer
            this.checkStopTimer();
        }
    }

    private checkPvControl():void {
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
                    this.setWallbox(tmpWallboxAmpere);
                } else {
                    // leider nicht genügend für ein Step - aber ist Netzbezug schon?
                    if(this.currentPower < 0) {
                        //Setze Wallbox niedriger
                        this.log.debug('Have not enough power - set Wallbox down: ' + tmpWallboxAmpere.toString());
                        this.setWallbox(tmpWallboxAmpere);
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
                this.stopPV();
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
            this.startTimer = this.setTimeout(() => {
                this.log.debug('Start timer finished');
                this.startPV()
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
            this.stopTimer = this.setTimeout(() => {
                this.log.debug('Stop timer finished');
                this.stopPV()
                this.runStopTimer = false;
            }, this.stopTime);
            this.runStopTimer = true;
        }
    }

    private startPV(): void {
        this.mode= 'PV';
    }

    private stopPV(): void {
        this.mode= 'stop';
        // Stoppen Wallbox
        this.setForeignStateAsync('0_userdata.0.wallbox_power', 0, true);
        this.setForeignStateAsync('0_userdata.0.wallbox_ampere', 0, true);
        this.setForeignStateAsync('0_userdata.0.wallbox_enable', false, true);
        this.wallboxAmpere = 0; // todo aufechte werte holen
    }

    private getAmpereFromWatt(watt: number): number{
        return watt/230;
    }

    private getWattFromAmpere(ampere: number): number {
        return ampere * 230;
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new PvPowerConrol(options);
} else {
    // otherwise start the instance directly
    (() => new PvPowerConrol())();
}