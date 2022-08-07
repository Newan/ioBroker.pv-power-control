![Logo](admin/pv-power-control.png)
# ioBroker.pv-power-control
Ziel dieses Adaoters ist es, im ersten SCHritt ein ELektro oder Hybridfahrzeug mit der Sonne bzw PV-Überschuss zu laden
Der Adapter unterstüztzt grundsätzlich alle Wechelrichter, alle Fahrzeuge und alle Wallboxen sofern diese in ioBroker eingebunden sind.

Später sind weitere Geräte wie, Klimaanlagen, Heizstäbe etc angedacht.

## Konfiguration
Um die Wallbox und damit den Ladevorgang zu steuern müssen diverse Konfigurationen eingetragen werden

### Allgemein

#### Intervall
Zeit in Sekunden wie oft geprüft werden soll und die Wallbox entsprechend angepasst wird

#### Startzeit
Wenn nicht geladen wird und genügend PV-Überschuss besteht, wird nochmal abgewartet ob der Überschuss stabil ist

#### Stopzeit
Wenn geladen wird und nicht genügend PV-Überschuss besteht, wird nochmal abgewartet ob der Überschuss ggf zurück kehrt


### Netz

#### Grid - Netzleistung in Watt
Der Adapter geht davon aus das der Überschuss einer PV über ein Wechselrichter oder Smartmeter angeben werden kann. Beispielsweise bei Fronius in "fronius.0.powerflow.P_Grid". Hier wird die Anzahl der Watt bei Einspeisung negativ ausgeben und bei Netzbezug Positiv (bitte Netzfactor hier beachten).

#### Netzfaktor 
Der Adapter geht davon aus das positve Werte = Überschuss bedeuten. Sollte der Smartmeter / Wechselrichter negative Werte als Überschuss ausgeben muss hier ein Factor von -1 gesetzte werden. Dies wäre beispielsweise, wie oben genannt bei Fronius der Fall.


### Wallbox
Wallboxen müssen dynamische AMpereänderungen übernehmen können um dynamisch laden zu können

#### Wallbox-ID aktivieren
ID ob eine Wallbox aktiviert wurde. Bei Anhalten oder starten des Ladevorgags wird dieser Wert auf true/false geändert

#### wallbox_ampere_id_p1
ID der Wallbox für die Ampereeinstellung für Phase 1, bei einer Easee Wallbox beispielsweise: easee.0.EXXXXXXX.config.dynamicCircuitCurrentP1 

#### wallbox_ampere_id_p2
ID der Wallbox für die Ampereeinstellung für Phase 2, bei einer Easee Wallbox beispielsweise: easee.0.EXXXXXXX.config.dynamicCircuitCurrentP2

#### wallbox_ampere_id_p3
ID der Wallbox für die Ampereeinstellung für Phase 3, bei einer Easee Wallbox beispielsweise: easee.0.EXXXXXXX.config.dynamicCircuitCurrentP3

### Maximales Ampere
Der maximal Amperewert der Wallbox pro Phase. Bei einer 11 KW Wallbox beträgt der Wert 16, bei einer 22 KW entsprechend 32.

### Min Ampere
Mindest Amperewert um eine Ladung zu starten. Derzeit ist ein guter Wert 6, für eine Easee Wallbox mit einem Audi A6.
Dies kann von Wallbox und Fahrzeug unterschiedlich sein und ggf früher laden.


### Fahrzeug

#### Fahrzeug-ID gesteckt
ID für den Fahrzeug zustand, ob dies angeschlossen ist. Hier mit könnte auch der ganze Daapter über eine VIS deaktiert werden

#### Fahrzeug-ID SoC
ID über den LAdezustand des Fahrzegs. Es wird bis 100% geladen und danach pausiert.
