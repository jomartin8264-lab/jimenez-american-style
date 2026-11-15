# Estrategia de Trading — Reversión EMA + ADX
**Timeframe:** 1 Hora (1H)
**Mercado:** Forex (pares de divisas)
**Tipo:** Reversión al final de tendencia (agotamiento)
**Estado actual:** Compras ✅ | Ventas ✅

---

## 📌 Concepto General

La estrategia busca atrapar el **final de una tendencia fuerte** (bajista para compras, alcista para ventas).
Cuando el precio cae o sube con fuerza, las EMAs se abren como un **abanico**. Cuando ese impulso se agota,
la **EMA 5 empieza a curvarse (redondearse)** de regreso hacia la EMA 20 — ese es el momento de entrada.

---

## 📊 Indicadores Utilizados

| Indicador | Parámetros |
|---|---|
| EMA 5   | Color: Fuchsia / Morado |
| EMA 20  | Color: Azul |
| EMA 50  | Color: Naranja |
| EMA 100 | Color: Gris |
| EMA 200 | Color: Negro |
| ADX     | Longitud 14, DI 14 |

---

## 🟢 SEÑAL DE COMPRA

### Contexto previo necesario
El precio viene de una **caída fuerte y sostenida**. Las EMAs se abren hacia abajo formando un abanico real (no un spike).

### Condiciones obligatorias (todas deben cumplirse)

#### 1. Abanico bajista estricto y sostenido
- Orden: EMA5 < EMA20 < EMA50 < EMA100
- Este orden debe llevar **mínimo 8 barras consecutivas** cumplido
- Elimina spikes: un spike de 1-2 velas jamás sostiene el orden 8 horas

#### 2. Todas las EMAs apuntando hacia abajo
- EMA20 apunta abajo (EMA20 actual < EMA20 barra anterior)
- EMA50 apunta abajo
- EMA100 apunta abajo ← CRÍTICO: la EMA100 tarda muchas horas en girar, un spike no la mueve

#### 3. Abanico SIGNIFICATIVO (no un pullback menor)
- Abanico rápido: EMA50 - EMA5 >= 1.5 × ATR(14) — la EMA5 está bien abajo
- Abanico lento:  EMA100 - EMA50 >= 0.5 × ATR(14) — las EMAs lentas también separadas

#### 4. Curveo sostenido de la EMA 5 (el "redondeo")
- La EMA5 lleva **3 barras consecutivas subiendo**
- No basta un rebote de 1 sola vela
- La EMA5 aún debe estar **por debajo de la EMA20** (buscando el cruce, no ya encima)

#### 5. Filtro ADX — cualquiera de los dos escenarios:
- Escenario A: El ADX llegó a 45+ en las últimas 6 barras y ahora está bajando (el "gancho")
- Escenario B: El ADX está muy bajo (≤ 15), sin fuerza bajista restante

---

## 🔴 SEÑAL DE VENTA

### Contexto previo necesario
El precio viene de una **subida fuerte y sostenida**. Las EMAs se abren hacia arriba formando un abanico real.

### Condiciones obligatorias (espejo exacto de la compra)

#### 1. Abanico alcista estricto y sostenido
- Orden: EMA5 > EMA20 > EMA50 > EMA100
- Este orden debe llevar **mínimo 8 barras consecutivas** cumplido

#### 2. Todas las EMAs apuntando hacia arriba
- EMA20 apunta arriba
- EMA50 apunta arriba
- EMA100 apunta arriba ← CRÍTICO para filtrar spikes

#### 3. Abanico SIGNIFICATIVO
- Abanico rápido: EMA5 - EMA50 >= 1.5 × ATR(14)
- Abanico lento:  EMA50 - EMA100 >= 0.5 × ATR(14)

#### 4. Curveo sostenido de la EMA 5 (el "redondeo" inverso)
- La EMA5 lleva **3 barras consecutivas bajando**
- La EMA5 aún debe estar **por encima de la EMA20**

#### 5. Filtro ADX — igual que en compras:
- Escenario A: ADX llegó a 45+ en las últimas 6 barras y ahora baja
- Escenario B: ADX ≤ 15, sin fuerza alcista restante

---

## ⚠️ Errores detectados y corregidos durante el desarrollo

| Error | Causa | Corrección aplicada |
|---|---|---|
| Señal en medio de la caída | EMA5 detectaba 1 sola barra de rebote | Se exigen 3 barras consecutivas de curveo |
| Señal en pullback menor | Solo verificaba orden de EMAs, no la separación | Separación mínima 1.5x ATR entre EMA5 y EMA50 |
| Señal en spike de 1-2 velas | El abanico se formaba instantáneamente | Se exigen 8 barras consecutivas con el abanico formado |
| EMAs lentas pegadas | No se verificaba separación entre EMAs lentas | Separación mínima 0.5x ATR entre EMA50 y EMA100 |
| EMA100 sin moverse | No se verificaba la dirección de la EMA100 | EMA100 debe apuntar en la dirección de la tendencia |
| Pico ADX fuera de timing | Se buscaba el pico exactamente en bar[1] | Se busca el pico en las últimas 6 barras (lookback) |

---

## 🔧 Parámetros Configurables en TradingView

| Parámetro | Valor por defecto | Descripción |
|---|---|---|
| Longitud ADX | 14 | Período del ADX |
| Longitud DI | 14 | Período de las líneas DI |
| Nivel ADX Alto | 45 | Umbral para el "gancho" del ADX (ajustar 45-55) |
| Nivel ADX Bajo | 15 | Umbral para ADX sin fuerza |
| Barras pico ADX | 6 | Ventana de búsqueda del pico del ADX |
| ATR abanico rápido | 1.5 | Multiplicador para EMA5 vs EMA50 |
| ATR abanico lento | 0.5 | Multiplicador para EMA50 vs EMA100 |
| Barras mínimas abanico | 8 | Tiempo mínimo que debe llevar formado el abanico |

---

## 📋 Código Pine Script v5 (versión actual)

```pine
//@version=5
indicator("Estrategia Reversión EMA + ADX [COMPRA & VENTA]", overlay=true)

len_ema5       = input.int(5,     title="EMA 5")
len_ema20      = input.int(20,    title="EMA 20")
len_ema50      = input.int(50,    title="EMA 50")
len_ema100     = input.int(100,   title="EMA 100")
len_ema200     = input.int(200,   title="EMA 200")
adx_len        = input.int(14,    title="Longitud ADX")
di_len         = input.int(14,    title="Longitud DI")
adx_high_level = input.int(45,    title="Nivel ADX Alto (gancho)")
adx_low_level  = input.int(15,    title="Nivel ADX Bajo (sin fuerza)")
adx_lookback   = input.int(6,     title="Barras para buscar pico ADX")
fan_mult_fast  = input.float(1.5, title="ATR minimo EMA5 vs EMA50 (abanico rapido)", step=0.1)
fan_mult_slow  = input.float(0.5, title="ATR minimo EMA50 vs EMA100 (abanico lento)", step=0.1)
barras_fan     = input.int(8,     title="Barras minimas con abanico formado", minval=5, maxval=20)

ema5   = ta.ema(close, len_ema5)
ema20  = ta.ema(close, len_ema20)
ema50  = ta.ema(close, len_ema50)
ema100 = ta.ema(close, len_ema100)
ema200 = ta.ema(close, len_ema200)
atr14  = ta.atr(14)

[diplus, diminus, adx_value] = ta.dmi(di_len, adx_len)

adx_pico_reciente = ta.highest(adx_value, adx_lookback) >= adx_high_level and adx_value < adx_value[1]
adx_muy_bajo      = adx_value <= adx_low_level
cond_adx          = adx_pico_reciente or adx_muy_bajo

// --- COMPRA ---
abanico_bajista       = ema5 < ema20 and ema20 < ema50 and ema50 < ema100
fan_bajista_sostenido = abanico_bajista[0] and abanico_bajista[1] and abanico_bajista[2] and abanico_bajista[3] and abanico_bajista[4] and abanico_bajista[5] and abanico_bajista[6] and abanico_bajista[7]
ema20_baja            = ema20 < ema20[1]
ema50_baja            = ema50 < ema50[1]
ema100_baja           = ema100 < ema100[1]
fan_rapido_bajista    = (ema50 - ema5) >= (atr14 * fan_mult_fast)
fan_lento_bajista     = (ema100 - ema50) >= (atr14 * fan_mult_slow)
curveo_arriba         = ema5[0] > ema5[1] and ema5[1] > ema5[2] and ema5[2] > ema5[3]
ema5_bajo_ema20       = ema5 < ema20
cond_emas_compra      = fan_bajista_sostenido and ema20_baja and ema50_baja and ema100_baja and fan_rapido_bajista and fan_lento_bajista
cond_price_compra     = curveo_arriba and ema5_bajo_ema20
senial_compra         = cond_emas_compra and cond_price_compra and cond_adx

// --- VENTA ---
abanico_alcista       = ema5 > ema20 and ema20 > ema50 and ema50 > ema100
fan_alcista_sostenido = abanico_alcista[0] and abanico_alcista[1] and abanico_alcista[2] and abanico_alcista[3] and abanico_alcista[4] and abanico_alcista[5] and abanico_alcista[6] and abanico_alcista[7]
ema20_sube            = ema20 > ema20[1]
ema50_sube            = ema50 > ema50[1]
ema100_sube           = ema100 > ema100[1]
fan_rapido_alcista    = (ema5 - ema50) >= (atr14 * fan_mult_fast)
fan_lento_alcista     = (ema50 - ema100) >= (atr14 * fan_mult_slow)
curveo_abajo          = ema5[0] < ema5[1] and ema5[1] < ema5[2] and ema5[2] < ema5[3]
ema5_encima_ema20     = ema5 > ema20
cond_emas_venta       = fan_alcista_sostenido and ema20_sube and ema50_sube and ema100_sube and fan_rapido_alcista and fan_lento_alcista
cond_price_venta      = curveo_abajo and ema5_encima_ema20
senial_venta          = cond_emas_venta and cond_price_venta and cond_adx

// --- DIBUJOS ---
plot(ema5,   color=color.fuchsia, linewidth=2, title="EMA 5")
plot(ema20,  color=color.blue,    linewidth=2, title="EMA 20")
plot(ema50,  color=color.orange,  linewidth=1, title="EMA 50")
plot(ema100, color=color.gray,    linewidth=1, title="EMA 100")
plot(ema200, color=color.black,   linewidth=1, title="EMA 200")

plotshape(series=senial_compra, title="Señal de Compra", location=location.belowbar, color=color.new(color.green, 0), style=shape.labelup, size=size.normal, text="COMPRA", textcolor=color.white)
plotshape(series=senial_venta, title="Señal de Venta", location=location.abovebar, color=color.new(color.red, 0), style=shape.labeldown, size=size.normal, text="VENTA", textcolor=color.white)
```

---

## 🚧 Pendiente por definir

- [ ] Stop Loss: donde colocarlo (sugerencia: por debajo/encima del último mínimo/máximo de la caída/subida)
- [ ] Take Profit: donde tomar ganancia (cuando EMA5 cruza EMA20? cuando toca EMA50?)
- [ ] Gestión de riesgo: % del capital por operación
- [ ] Backtesting formal con datos históricos
- [ ] Añadir alertas automáticas de TradingView cuando se dispare la señal
