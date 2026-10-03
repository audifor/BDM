
### TEST A · misma plantilla, distinto entrenador

| config | pos. | s/pos | trans. | pases/pos | penet./pos | bloq./pos | sin balón/pos | aro | media | triple | C&S | pull-up | %OREB | TOV/pos | PPP | AST/FGM | iniciador top | spacing |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| neutral | 92.83 | 11.46 | 9.0% | 2.49 | 0.67 | 0.39 | 0.18 | 24.8% | 4.2% | 57.7% | 52.9% | 7.8% | 19.2% | 17.6% | 0.94 | 0.59 | 31.5% | 4OUT1IN 89%, 5OUT 11% |
| coachA | 100.50 | 11.12 | 17.4% | 2.46 | 0.64 | 0.42 | 0.11 | 29.1% | 2.6% | 52.8% | 48.7% | 6.6% | 22.7% | 21.4% | 0.83 | 0.51 | 24.5% | 4OUT1IN 83%, 5OUT 17% |
| coachB | 88.67 | 12.75 | 3.2% | 2.87 | 0.68 | 0.51 | 0.26 | 21.2% | 7.1% | 55.6% | 54.3% | 10.9% | 21.9% | 20.1% | 0.96 | 0.62 | 30.4% | 4OUT1IN 95%, 5OUT 5% |
| coachC | 89.33 | 12.11 | 8.2% | 2.58 | 0.71 | 0.46 | 0.18 | 21.6% | 3.9% | 58.7% | 53.4% | 10.3% | 18.7% | 15.3% | 0.98 | 0.57 | 34.2% | 4OUT1IN 100%, 5OUT 1% |

- neutral: familias BALL_SCREEN 32 · CIRCULATION 17 · DRIVE_KICK 16 · EARLY_OFFENSE 8 · ISOLATION 14 · MOVEMENT 11 · POST 2; cobertura usada {"switch":1}; roll 62.6%; ajustes 0.667
- coachA: familias BALL_SCREEN 46 · CIRCULATION 10 · DRIVE_KICK 19 · EARLY_OFFENSE 5 · ISOLATION 13 · MOVEMENT 6 · POST 2; cobertura usada {"blitz":0.541,"drop":0.137,"hedge":0.322}; roll 66.8%; ajustes 1.667
- coachB: familias BALL_SCREEN 24 · CIRCULATION 24 · DRIVE_KICK 14 · EARLY_OFFENSE 2 · ISOLATION 8 · MOVEMENT 23 · POST 6; cobertura usada {"drop":1}; roll 69.4%; ajustes 0.667
- coachC: familias BALL_SCREEN 33 · CIRCULATION 11 · DRIVE_KICK 18 · EARLY_OFFENSE 7 · ISOLATION 14 · MOVEMENT 15 · POST 2; cobertura usada {"drop":0.551,"hedge":0.107,"switch":0.341}; roll 62.2%; ajustes 2.667

Distancia de identidad (0 = mismo estilo):

- neutral ↔ coachA: 0.74
- neutral ↔ coachB: 0.75
- neutral ↔ coachC: 0.41
- coachA ↔ coachB: 1.04
- coachA ↔ coachC: 0.97
- coachB ↔ coachC: 0.66

### TEST B · mismo entrenador (C), distinta plantilla

| config | pos. | s/pos | trans. | pases/pos | penet./pos | bloq./pos | sin balón/pos | aro | media | triple | C&S | pull-up | %OREB | TOV/pos | PPP | AST/FGM | iniciador top | spacing |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| coachC | 89.33 | 12.11 | 8.2% | 2.58 | 0.71 | 0.46 | 0.18 | 21.6% | 3.9% | 58.7% | 53.4% | 10.3% | 18.7% | 15.3% | 0.98 | 0.57 | 34.2% | 4OUT1IN 100%, 5OUT 1% |
| rosterCreation | 96.50 | 10.37 | 5.5% | 2.95 | 0.48 | 0.33 | 0.19 | 34.2% | 2.6% | 59.9% | 54.8% | 3.3% | 9.9% | 21.2% | 0.98 | 0.54 | 38.2% | 5OUT 100% |
| rosterInterior | 87.67 | 13.13 | 6.8% | 3.09 | 1.01 | 0.65 | 0.14 | 29.6% | 4.3% | 41.2% | 47.8% | 13.4% | 25.1% | 21.9% | 0.81 | 0.49 | 26.2% | 4OUT1IN 100% |
| rosterDefense | 85.50 | 13.45 | 6.4% | 3.27 | 0.66 | 0.61 | 0.19 | 16.4% | 6.9% | 64.0% | 60.4% | 7.4% | 21.7% | 17.3% | 0.89 | 0.54 | 35.0% | 4OUT1IN 100% |

- coachC: familias BALL_SCREEN 33 · CIRCULATION 11 · DRIVE_KICK 18 · EARLY_OFFENSE 7 · ISOLATION 14 · MOVEMENT 15 · POST 2; cobertura usada {"drop":0.551,"hedge":0.107,"switch":0.341}; roll 62.2%; ajustes 2.667
- rosterCreation: familias BALL_SCREEN 35 · CIRCULATION 15 · DRIVE_KICK 12 · EARLY_OFFENSE 11 · ISOLATION 12 · MOVEMENT 12 · POST 4; cobertura usada {"drop":0.317,"hedge":0.087,"switch":0.596}; roll 0.0%; ajustes 3
- rosterInterior: familias BALL_SCREEN 30 · CIRCULATION 11 · DRIVE_KICK 14 · EARLY_OFFENSE 8 · ISOLATION 12 · POST 26; cobertura usada {"drop":0.411,"switch":0.589}; roll 100.0%; ajustes 2.833
- rosterDefense: familias BALL_SCREEN 33 · CIRCULATION 18 · DRIVE_KICK 13 · EARLY_OFFENSE 9 · ISOLATION 10 · MOVEMENT 13 · POST 5; cobertura usada {"switch":1}; roll 100.0%; ajustes 2.167

Distancia de identidad (0 = mismo estilo):

- coachC ↔ rosterCreation: 1.32
- coachC ↔ rosterInterior: 1.35
- coachC ↔ rosterDefense: 0.86
- rosterCreation ↔ rosterInterior: 1.86
- rosterCreation ↔ rosterDefense: 1.54
- rosterInterior ↔ rosterDefense: 1.43

### TEST C · misma plantilla y entrenador (C), distinto plan

| config | pos. | s/pos | trans. | pases/pos | penet./pos | bloq./pos | sin balón/pos | aro | media | triple | C&S | pull-up | %OREB | TOV/pos | PPP | AST/FGM | iniciador top | spacing |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| coachC | 89.33 | 12.11 | 8.2% | 2.58 | 0.71 | 0.46 | 0.18 | 21.6% | 3.9% | 58.7% | 53.4% | 10.3% | 18.7% | 15.3% | 0.98 | 0.57 | 34.2% | 4OUT1IN 100%, 5OUT 1% |
| planInside | 90.17 | 11.68 | 10.0% | 2.66 | 0.81 | 0.35 | 0.18 | 28.7% | 5.0% | 52.5% | 49.7% | 9.8% | 21.5% | 17.4% | 0.95 | 0.47 | 39.1% | 4OUT1IN 95%, 5OUT 5% |
| planSpread | 88.83 | 11.97 | 5.8% | 2.92 | 0.55 | 0.53 | 0.23 | 18.1% | 5.0% | 61.4% | 57.3% | 9.0% | 16.3% | 19.9% | 1.00 | 0.64 | 36.3% | 4OUT1IN 46%, 5OUT 54% |
| planPush | 97.67 | 11.27 | 11.9% | 2.48 | 0.71 | 0.37 | 0.16 | 31.9% | 4.9% | 50.7% | 47.4% | 7.6% | 20.1% | 16.0% | 0.96 | 0.49 | 28.8% | 4OUT1IN 82%, 5OUT 18% |

- coachC: familias BALL_SCREEN 33 · CIRCULATION 11 · DRIVE_KICK 18 · EARLY_OFFENSE 7 · ISOLATION 14 · MOVEMENT 15 · POST 2; cobertura usada {"drop":0.551,"hedge":0.107,"switch":0.341}; roll 62.2%; ajustes 2.667
- planInside: familias BALL_SCREEN 20 · CIRCULATION 14 · DRIVE_KICK 16 · EARLY_OFFENSE 10 · ISOLATION 14 · MOVEMENT 8 · POST 18; cobertura usada {"drop":0.575,"switch":0.425}; roll 53.8%; ajustes 2.833
- planSpread: familias BALL_SCREEN 34 · CIRCULATION 20 · DRIVE_KICK 11 · EARLY_OFFENSE 6 · ISOLATION 12 · MOVEMENT 16 · POST 2; cobertura usada {"drop":0.6,"switch":0.4}; roll 58.5%; ajustes 2.667
- planPush: familias BALL_SCREEN 32 · CIRCULATION 12 · DRIVE_KICK 17 · EARLY_OFFENSE 6 · ISOLATION 15 · MOVEMENT 15 · POST 3; cobertura usada {"drop":0.505,"switch":0.495}; roll 64.3%; ajustes 2.667

Distancia de identidad (0 = mismo estilo):

- coachC ↔ planInside: 0.64
- coachC ↔ planSpread: 0.74
- coachC ↔ planPush: 0.67
- planInside ↔ planSpread: 1.08
- planInside ↔ planPush: 0.40
- planSpread ↔ planPush: 1.25

### BT5.23 · entrenador x plantilla

| config | pos. | s/pos | trans. | pases/pos | penet./pos | bloq./pos | sin balón/pos | aro | media | triple | C&S | pull-up | %OREB | TOV/pos | PPP | AST/FGM | iniciador top | spacing |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| coachA | 100.50 | 11.12 | 17.4% | 2.46 | 0.64 | 0.42 | 0.11 | 29.1% | 2.6% | 52.8% | 48.7% | 6.6% | 22.7% | 21.4% | 0.83 | 0.51 | 24.5% | 4OUT1IN 83%, 5OUT 17% |
| coachA_creation | 100.50 | 10.99 | 16.7% | 3.60 | 0.47 | 0.35 | 0.21 | 27.8% | 1.6% | 66.2% | 59.6% | 1.4% | 11.1% | 18.9% | 0.99 | 0.62 | 32.0% | 5OUT 100% |
| coachA_interior | 99.00 | 11.76 | 16.0% | 2.55 | 0.93 | 0.58 | 0.12 | 37.2% | 3.2% | 36.2% | 39.6% | 8.7% | 23.8% | 25.1% | 0.76 | 0.38 | 24.8% | 4OUT1IN 100% |
| coachB | 88.67 | 12.75 | 3.2% | 2.87 | 0.68 | 0.51 | 0.26 | 21.2% | 7.1% | 55.6% | 54.3% | 10.9% | 21.9% | 20.1% | 0.96 | 0.62 | 30.4% | 4OUT1IN 95%, 5OUT 5% |
| coachB_creation | 84.83 | 12.84 | 4.7% | 4.16 | 0.49 | 0.41 | 0.35 | 18.0% | 2.5% | 75.0% | 67.0% | 3.6% | 9.4% | 16.5% | 0.93 | 0.66 | 35.0% | 5OUT 100% |
| coachB_interior | 81.00 | 14.64 | 3.3% | 3.81 | 1.02 | 0.74 | 0.20 | 23.5% | 4.4% | 42.0% | 51.3% | 14.9% | 23.9% | 21.8% | 0.73 | 0.67 | 31.8% | 4OUT1IN 100% |

- coachA: familias BALL_SCREEN 46 · CIRCULATION 10 · DRIVE_KICK 19 · EARLY_OFFENSE 5 · ISOLATION 13 · MOVEMENT 6 · POST 2; cobertura usada {"blitz":0.541,"drop":0.137,"hedge":0.322}; roll 66.8%; ajustes 1.667
- coachA_creation: familias BALL_SCREEN 45 · CIRCULATION 12 · DRIVE_KICK 14 · EARLY_OFFENSE 7 · ISOLATION 12 · MOVEMENT 8 · POST 2; cobertura usada {"blitz":0.763,"drop":0.093,"hedge":0.144}; roll 0.0%; ajustes 1.333
- coachA_interior: familias BALL_SCREEN 46 · CIRCULATION 9 · DRIVE_KICK 17 · EARLY_OFFENSE 8 · ISOLATION 13 · POST 7; cobertura usada {"blitz":0.606,"hedge":0.394}; roll 100.0%; ajustes 1
- coachB: familias BALL_SCREEN 24 · CIRCULATION 24 · DRIVE_KICK 14 · EARLY_OFFENSE 2 · ISOLATION 8 · MOVEMENT 23 · POST 6; cobertura usada {"drop":1}; roll 69.4%; ajustes 0.667
- coachB_creation: familias BALL_SCREEN 25 · CIRCULATION 24 · DRIVE_KICK 9 · EARLY_OFFENSE 4 · ISOLATION 6 · MOVEMENT 28 · POST 4; cobertura usada {"drop":0.623,"hedge":0.264,"switch":0.113}; roll 0.0%; ajustes 1.667
- coachB_interior: familias BALL_SCREEN 23 · CIRCULATION 23 · DRIVE_KICK 11 · EARLY_OFFENSE 1 · ISOLATION 8 · POST 33; cobertura usada {"drop":0.876,"hedge":0.124}; roll 100.0%; ajustes 0.833

Distancia de identidad (0 = mismo estilo):

- coachA ↔ coachA_creation: 1.35
- coachA ↔ coachA_interior: 1.12
- coachA ↔ coachB: 1.04
- coachA ↔ coachB_creation: 2.13
- coachA ↔ coachB_interior: 1.75
- coachA_creation ↔ coachA_interior: 2.39
- coachA_creation ↔ coachB: 1.69
- coachA_creation ↔ coachB_creation: 1.04
- coachA_creation ↔ coachB_interior: 2.38
- coachA_interior ↔ coachB: 1.59
- coachA_interior ↔ coachB_creation: 3.09
- coachA_interior ↔ coachB_interior: 1.52
- coachB ↔ coachB_creation: 1.79
- coachB ↔ coachB_interior: 1.16
- coachB_creation ↔ coachB_interior: 2.46

### Familiaridad

| config | pos. | s/pos | trans. | pases/pos | penet./pos | bloq./pos | sin balón/pos | aro | media | triple | C&S | pull-up | %OREB | TOV/pos | PPP | AST/FGM | iniciador top | spacing |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| coachC | 89.33 | 12.11 | 8.2% | 2.58 | 0.71 | 0.46 | 0.18 | 21.6% | 3.9% | 58.7% | 53.4% | 10.3% | 18.7% | 15.3% | 0.98 | 0.57 | 34.2% | 4OUT1IN 100%, 5OUT 1% |
| familiarityLow | 92.00 | 12.24 | 10.0% | 2.76 | 0.75 | 0.48 | 0.20 | 26.7% | 5.4% | 54.0% | 51.1% | 8.1% | 19.0% | 13.4% | 0.93 | 0.54 | 28.2% | 4OUT1IN 81%, 5OUT 19% |
| familiarityHigh | 93.67 | 11.74 | 7.8% | 2.48 | 0.70 | 0.46 | 0.18 | 23.1% | 4.5% | 55.2% | 49.3% | 9.1% | 19.4% | 18.3% | 0.90 | 0.55 | 32.8% | 4OUT1IN 81%, 5OUT 19% |

- coachC: familias BALL_SCREEN 33 · CIRCULATION 11 · DRIVE_KICK 18 · EARLY_OFFENSE 7 · ISOLATION 14 · MOVEMENT 15 · POST 2; cobertura usada {"drop":0.551,"hedge":0.107,"switch":0.341}; roll 62.2%; ajustes 2.667
- familiarityLow: familias BALL_SCREEN 32 · CIRCULATION 14 · DRIVE_KICK 14 · EARLY_OFFENSE 7 · ISOLATION 16 · MOVEMENT 13 · POST 5; cobertura usada {"drop":0.579,"switch":0.421}; roll 60.8%; ajustes 2.5
- familiarityHigh: familias BALL_SCREEN 34 · CIRCULATION 12 · DRIVE_KICK 17 · EARLY_OFFENSE 7 · ISOLATION 17 · MOVEMENT 12 · POST 1; cobertura usada {"drop":0.617,"switch":0.383}; roll 57.3%; ajustes 2.667

Distancia de identidad (0 = mismo estilo):

- coachC ↔ familiarityLow: 0.45
- coachC ↔ familiarityHigh: 0.43
- familiarityLow ↔ familiarityHigh: 0.52

### Mandos antiguos (perfil de tiro, ya no multiplica)

| config | pos. | s/pos | trans. | pases/pos | penet./pos | bloq./pos | sin balón/pos | aro | media | triple | C&S | pull-up | %OREB | TOV/pos | PPP | AST/FGM | iniciador top | spacing |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| neutral | 92.83 | 11.46 | 9.0% | 2.49 | 0.67 | 0.39 | 0.18 | 24.8% | 4.2% | 57.7% | 52.9% | 7.8% | 19.2% | 17.6% | 0.94 | 0.59 | 31.5% | 4OUT1IN 89%, 5OUT 11% |
| legacyThree | 87.17 | 12.86 | 4.6% | 3.26 | 0.43 | 0.62 | 0.30 | 16.5% | 3.6% | 71.4% | 63.1% | 5.9% | 12.4% | 14.7% | 1.00 | 0.66 | 42.3% | 5OUT 100% |
| legacyRim | 95.00 | 11.64 | 9.8% | 2.79 | 0.87 | 0.37 | 0.16 | 30.7% | 5.6% | 45.0% | 43.8% | 12.2% | 22.2% | 19.3% | 0.93 | 0.49 | 34.9% | 4OUT1IN 99%, 5OUT 1% |

- neutral: familias BALL_SCREEN 32 · CIRCULATION 17 · DRIVE_KICK 16 · EARLY_OFFENSE 8 · ISOLATION 14 · MOVEMENT 11 · POST 2; cobertura usada {"switch":1}; roll 62.6%; ajustes 0.667
- legacyThree: familias BALL_SCREEN 34 · CIRCULATION 19 · DRIVE_KICK 13 · EARLY_OFFENSE 4 · ISOLATION 14 · MOVEMENT 13 · POST 3; cobertura usada {"drop":0.168,"switch":0.832}; roll 57.4%; ajustes 0.833
- legacyRim: familias BALL_SCREEN 25 · CIRCULATION 8 · DRIVE_KICK 15 · EARLY_OFFENSE 10 · ISOLATION 8 · MOVEMENT 7 · POST 28; cobertura usada {"drop":0.291,"switch":0.709}; roll 65.6%; ajustes 0.5

Distancia de identidad (0 = mismo estilo):

- neutral ↔ legacyThree: 1.48
- neutral ↔ legacyRim: 0.89
- legacyThree ↔ legacyRim: 2.22

### TEST D · mismo equipo local (neutro), distinto rival

| config | pos. | s/pos | trans. | pases/pos | penet./pos | bloq./pos | sin balón/pos | aro | media | triple | C&S | pull-up | %OREB | TOV/pos | PPP | AST/FGM | iniciador top | spacing |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| neutral | 92.83 | 11.46 | 9.0% | 2.49 | 0.67 | 0.39 | 0.18 | 24.8% | 4.2% | 57.7% | 52.9% | 7.8% | 19.2% | 17.6% | 0.94 | 0.59 | 31.5% | 4OUT1IN 89%, 5OUT 11% |
| oppCreation | 94.00 | 11.95 | 8.0% | 2.71 | 0.75 | 0.45 | 0.15 | 31.8% | 3.1% | 49.1% | 44.8% | 8.7% | 29.1% | 15.1% | 1.00 | 0.48 | 34.4% | 4OUT1IN 88%, 5OUT 12% |
| oppDefense | 84.83 | 12.29 | 7.1% | 2.88 | 0.69 | 0.47 | 0.17 | 19.6% | 1.6% | 69.8% | 64.4% | 2.4% | 21.0% | 20.0% | 0.97 | 0.70 | 37.7% | 4OUT1IN 70%, 5OUT 31% |
| oppCoachA | 100.17 | 11.49 | 9.5% | 2.33 | 0.71 | 0.45 | 0.14 | 33.1% | 3.7% | 50.6% | 48.5% | 8.5% | 23.0% | 15.6% | 0.97 | 0.50 | 31.4% | 4OUT1IN 78%, 5OUT 22% |
- neutral ↔ oppCreation (local): 0.92
- neutral ↔ oppDefense (local): 0.95
- neutral ↔ oppCoachA (local): 0.61

### BT5.19 · lo que concede cada cobertura (ataque rival frente a la defensa local)

| cobertura | PPP rival | aro rival | triple rival | pull-up rival | PnR (manejador+roller) rival | TOV/pos rival | robos/pos local | switches/bloqueo | ayudas/penetración |
|---|---|---|---|---|---|---|---|---|---|
| covDrop | 0.97 | 35.3% | 51.5% | 3.7% | 12.7% | 17.1% | 13.6% | 0.00 | 0.93 |
| covSwitch | 1.02 | 25.6% | 60.2% | 5.2% | 8.3% | 15.4% | 12.8% | 0.97 | 0.94 |
| covHedge | 1.08 | 33.1% | 53.9% | 5.5% | 12.4% | 14.4% | 12.3% | 0.00 | 0.93 |
| covBlitz | 0.97 | 33.7% | 53.8% | 3.9% | 7.4% | 17.2% | 14.7% | 0.00 | 0.93 |

### BT5.19 · ayuda y presión (ataque rival frente a la defensa local)

| defensa local | PPP rival | aro rival | triple rival | C&S rival | TOV/pos rival | robos/pos local | tapones/FGA | FTA/FGA rival | ayudas/penetración | TAG/DIG por partido |
|---|---|---|---|---|---|---|---|---|---|---|
| helpHigh | 1.07 | 32.0% | 53.8% | 50.3% | 15.4% | 12.3% | 4.0% | 0.21 | 0.93 | {"help:DIG":52,"help:TAG":14.5} |
| helpLow | 1.02 | 32.8% | 55.0% | 48.9% | 14.5% | 12.0% | 4.0% | 0.20 | 0.91 | {"help:DIG":22.167} |
| pressureHigh | 1.17 | 39.8% | 45.7% | 43.6% | 10.9% | 9.3% | 3.2% | 0.28 | 0.93 | {"help:DIG":33.167,"help:TAG":17.5} |
| pressureLow | 1.04 | 31.2% | 53.8% | 50.0% | 14.1% | 11.5% | 4.0% | 0.16 | 0.95 | {"help:DIG":46.833,"help:TAG":23.5} |
| coachC | 1.14 | 31.9% | 54.4% | 51.5% | 14.4% | 12.4% | 4.3% | 0.17 | 0.93 | {"help:DIG":44.333,"help:TAG":20.667} |

### BT5.26 · adaptación

- adaptHigh: ajustes por partido 2.833; cobertura usada {"drop":0.557,"hedge":0.443}; PPP rival 0.91
- adaptLow: ajustes por partido 0; cobertura usada {"drop":0.663,"hedge":0.337}; PPP rival 1.04