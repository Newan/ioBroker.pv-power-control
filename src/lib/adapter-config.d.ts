// This file extends the AdapterConfig type from "@types/iobroker"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
    namespace ioBroker {
        interface AdapterConfig {
            intervall: number;
            start_time: number;
            stop_time: number;
            grid_factor: number;
            grid_id: string;
            wallbox_enable_id: string;
            wallbox_ampere_id: string;
            wallbox_ampere_step: number;
            wallbox_ampere_max: number;
            wallbox_ampere_min: number;
            vehicle_pluged_id: string;
            vehicle_soc_id: string;
        }
    }
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};