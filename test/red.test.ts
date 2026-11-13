import { describe, expect, it } from 'vitest';
import { trazarPista } from '../src/core/curva';
import { Polilinea } from '../src/core/polilinea';
import { Red } from '../src/core/red';
import { abrir, conValoresClasicos, REGLAS, redPequena } from './apoyo';

describe('Red: activación y reglas de construcción', () => {
  it('al empezar solo están activas las bases', () => {
    const red = redPequena();
    expect([0, 1, 2, 3].map((i) => red.activo(i))).toEqual([true, true, false, false]);
  });

  it('los remontes solo arrancan en puntos de inicio y siempre suben', () => {
    const red = redPequena();
    expect(red.puedeConstruirRemonte(2, 3)).toBe('origen-no-arranca');
    expect(red.puedeConstruirRemonte(0, 1)).toBe('destino-base'); // entre bases no hay remontes
    expect(red.puedeConstruirRemonte(0, 0)).toBe('mismo-nodo');
    expect(red.puedeConstruirRemonte(0, 2)).toBe('ok');
  });

  it('construir un remonte activa el destino y no admite duplicados', () => {
    const red = redPequena();
    red.construirRemonte(0, 2);
    expect(red.activo(2)).toBe(true);
    expect(red.puedeConstruirRemonte(0, 2)).toBe('ya-existe');
    expect(red.puedeConstruirRemonte(2, 3)).toBe('ok'); // sigue desde el cuadrado
    red.construirRemonte(2, 3);
    expect(red.puedeConstruirRemonte(3, 2)).toBe('origen-no-arranca'); // de un triángulo no arranca nada
  });

  it('al empezar ningún punto tiene estación: los círculos grises toman su símbolo al usarse', () => {
    const red = redPequena();
    expect(red.estaciones).toEqual([]);
    red.construirRemonte(0, 2); // la base pasa a círculo y el intermedio a cuadrado
    expect(red.estacionesDe(0).map((e) => e.tipo)).toEqual(['salida']);
    expect(red.estacionesDe(2).map((e) => e.tipo)).toEqual(['paso']);
    red.construirRemonte(1, 3); // a una cima se llega en triángulo
    expect(red.estacionesDe(3).map((e) => e.tipo)).toEqual(['llegada']);
    expect(red.estacionesDe(0)[0]).toMatchObject({ ox: 0, oy: 0 });
  });

  it('una línea tiene como mucho un punto intermedio: el tramo que sigue de un cuadrado acaba en triángulo', () => {
    // Base 0, intermedios 1 y 2 escalonados y cima 3.
    const red = new Red(
      [
        { id: 0, tipo: 'base', x: 0, y: 3000, cota: 1500 },
        { id: 1, tipo: 'intermedio', x: 0, y: 2000, cota: 1800 },
        { id: 2, tipo: 'intermedio', x: 0, y: 1000, cota: 2100 },
        { id: 3, tipo: 'cima', x: 0, y: 0, cota: 2400 },
      ],
      REGLAS,
    );
    red.construirRemonte(0, 1);
    const sigue = red.construirRemonte(1, 2); // sigue desde el cuadrado
    expect(red.estaciones[sigue.estacionDesde].tipo).toBe('paso'); // sale del mismo cuadrado
    expect(red.estacionesDe(2).map((e) => e.tipo)).toEqual(['llegada']); // triángulo, no cuadrado
  });

  it('de un cuadrado que ya siguió, o de un triángulo que no es cima, arranca un remonte nuevo desdoblando un círculo', () => {
    const red = new Red(
      [
        { id: 0, tipo: 'base', x: 0, y: 3000, cota: 1500 },
        { id: 1, tipo: 'intermedio', x: 0, y: 2000, cota: 1800 },
        { id: 2, tipo: 'intermedio', x: 0, y: 1000, cota: 2100 },
        { id: 3, tipo: 'cima', x: 0, y: 0, cota: 2400 },
        { id: 4, tipo: 'intermedio', x: 900, y: 1200, cota: 2050 },
      ],
      REGLAS,
    );
    red.construirRemonte(0, 1);
    red.construirRemonte(1, 2); // línea completa: cuadrado en 1, triángulo en 2
    // Desde el cuadrado: círculo nuevo pegado, que llega a un intermedio como cuadrado (es una línea nueva).
    const nuevo = red.construirRemonte(1, 4);
    expect(red.estaciones[nuevo.estacionDesde].tipo).toBe('salida');
    expect(red.estacionesDe(1).map((e) => e.tipo)).toEqual(['paso', 'salida']);
    expect(red.estacionesDe(4).map((e) => e.tipo)).toEqual(['paso']);
    // Desde el triángulo de un intermedio (punto alto que no es cima): base nueva que sube más.
    expect(red.puedeArrancar(2)).toBe(true);
    const arriba = red.construirRemonte(2, 3);
    expect(red.estaciones[arriba.estacionDesde].tipo).toBe('salida');
    expect(red.estacionesDe(2).map((e) => e.tipo)).toEqual(['llegada', 'salida']);
  });

  it('de una cima no arranca ningún remonte', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    expect(red.puedeArrancar(3)).toBe(false);
  });

  it('de un cuadrado o una base se puede arrancar; de una cima no', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    red.construirRemonte(1, 2); // cuadrado en 2
    expect(red.puedeArrancar(2)).toBe(true);
    expect(red.puedeArrancar(3)).toBe(false); // triángulo
    expect(red.puedeArrancar(0)).toBe(true); // las bases siempre (desdoblándose)
  });

  it('una base se desdobla en nuevas salidas, una por remonte', () => {
    const red = redPequena();
    red.construirRemonte(0, 2);
    red.construirRemonte(0, 3);
    const est = red.estacionesDe(0);
    expect(est.map((e) => e.tipo)).toEqual(['salida', 'salida']);
    expect(Math.hypot(est[1].ox, est[1].oy)).toBeCloseTo(1, 10);
  });

  it('a una cima llegan hasta tres remontes, cada uno a su triángulo', () => {
    const red = redPequena();
    red.construirRemonte(0, 2);
    red.construirRemonte(2, 3);
    red.construirRemonte(0, 3);
    red.construirRemonte(1, 3);
    const est = red.estacionesDe(3);
    expect(est.map((e) => e.tipo)).toEqual(['llegada', 'llegada', 'llegada']);
    const posiciones = new Set(est.map((e) => `${e.ox.toFixed(3)},${e.oy.toFixed(3)}`));
    expect(posiciones.size).toBe(3);
    expect(new Set(red.remontes.filter((r) => r.hasta === 3).map((r) => r.estacionHasta)).size).toBe(3);
  });

  it('el triángulo nuevo se pega por el lado del que llega la línea', () => {
    const red = redPequena();
    red.construirRemonte(0, 3); // llega desde abajo a la izquierda
    red.construirRemonte(1, 3); // llega desde abajo a la derecha
    expect(red.estacionesDe(3)[1].ox).toBeGreaterThan(0);
    const otra = redPequena();
    otra.construirRemonte(1, 3);
    otra.construirRemonte(0, 3);
    expect(otra.estacionesDe(3)[1].ox).toBeLessThan(0);
  });

  it('un intermedio es de paso y se desdobla solo como salida o llegada', () => {
    const red = redPequena();
    red.construirRemonte(0, 2); // llega al cuadrado
    red.construirRemonte(2, 3); // sale del cuadrado
    red.construirRemonte(1, 2); // segunda llegada: triángulo nuevo
    expect(red.estacionesDe(2).map((e) => e.tipo)).toEqual(['paso', 'llegada']);
  });

  it('cuando el emplazamiento llega al máximo de estaciones se rechaza', () => {
    const red = new Red(redPequena().nodos.map((n) => ({ ...n })), { ...REGLAS, maxEstacionesPorNodo: 1 });
    red.construirRemonte(0, 2);
    expect(red.puedeConstruirRemonte(0, 3)).toBe('origen-lleno');
    expect(red.puedeConstruirRemonte(1, 2)).toBe('destino-lleno');
  });

  it('planear no modifica la red', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    expect(red.planearEstacion(1, 'llegada', 3)).not.toBeNull();
    red.puedeConstruirRemonte(1, 3);
    expect(red.estaciones.length).toBe(2);
  });

  it('el remonte nace inactivo y entra en servicio con cualquier pista desde su cima', () => {
    const red = redPequena();
    const r = red.construirRemonte(0, 2);
    expect(red.enServicio(r)).toBe(false);
    abrir(red, 2, 1); // no vuelve a su base, pero sale de su cima
    expect(red.enServicio(r)).toBe(true);
  });

  it('las pistas bajan, salen de nodos activos y no salen de bases', () => {
    const red = redPequena();
    expect(red.puedeAbrirPista(3, 0)).toBe('origen-inactivo');
    expect(red.puedeAbrirPista(1, 0)).toBe('pista-desde-base');
    red.construirRemonte(0, 2);
    expect(red.puedeAbrirPista(2, 3)).toBe('destino-no-mas-bajo');
    expect(red.puedeAbrirPista(2, 0)).toBe('ok');
  });

  it('una pista hacia un punto sin salida queda en espera hasta que lo tenga (sin puntos ciegos)', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    red.construirRemonte(1, 2);
    // El intermedio está activo pero no tiene salida: no es viable.
    expect(red.viable(2)).toBe(false);
    const p = abrir(red, 3, 2);
    expect(red.pistaActiva(p)).toBe(false); // en espera
    abrir(red, 2, 0);
    expect(red.viable(2)).toBe(true);
    expect(red.pistaActiva(p)).toBe(true); // se activa sola
  });

  it('admite dos pistas por pareja, a lados opuestos (lente)', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    const a = abrir(red, 3, 0);
    const b = abrir(red, 3, 0);
    expect(b.lado).toBe(-a.lado);
    expect(red.puedeAbrirPista(3, 0)).toBe('ya-existe');
  });

  it('la pendiente efectiva es ΔH / L con L la longitud real de la curva', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    const p = abrir(red, 3, 0);
    expect(p.pendiente).toBeCloseTo(900 / p.trazado.longitud, 10);
    const recta = Math.hypot(200, 1000);
    expect(p.trazado.longitud).toBeGreaterThan(recta);
  });

  it('un remonte que pasa por un intermedio funciona entero con una pista arriba', () => {
    const red = redPequena();
    const abajo = red.construirRemonte(0, 2); // llega al cuadrado
    const arriba = red.construirRemonte(2, 3); // sale del cuadrado: misma línea
    abrir(red, 3, 1);
    expect(red.enServicio(arriba)).toBe(true);
    expect(red.enServicio(abajo)).toBe(true);
  });

  it('un tramo que solo llega a un desdoble del intermedio no se activa por el de arriba', () => {
    const red = redPequena();
    red.construirRemonte(0, 2); // cuadrado: llegada
    red.construirRemonte(2, 3); // cuadrado: salida
    const otro = red.construirRemonte(1, 2); // triángulo de desdoble
    abrir(red, 3, 0);
    expect(red.estaciones[otro.estacionHasta].tipo).toBe('llegada');
    expect(red.enServicio(otro)).toBe(false);
  });

  it('un remonte que llega a una cima que ya tiene pistas funciona desde el principio', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    abrir(red, 3, 0);
    const nuevo = red.construirRemonte(1, 3);
    expect(red.enServicio(nuevo)).toBe(true);
  });

  it('los remontes no pueden cruzarse, pero sí compartir emplazamiento', () => {
    // 0 (0,3000) → 3 (400,0) y 1 (300,3000) → 4 (−300,1500) se cruzan.
    const nodos = redPequena().nodos.map((n) => ({ ...n }));
    nodos.push({ id: 4, tipo: 'intermedio', x: -300, y: 1500, cota: 1900 });
    const red = new Red(nodos, REGLAS);
    red.construirRemonte(0, 3);
    expect(red.puedeConstruirRemonte(1, 4)).toBe('cruza-remonte');
    expect(red.puedeConstruirRemonte(1, 3)).toBe('ok'); // llega al mismo pico
    expect(red.puedeConstruirRemonte(0, 2)).toBe('ok'); // sale de la misma base
  });

  it('deshacer quita la última construcción y las estaciones que creó', () => {
    const red = redPequena();
    expect(red.puedeDeshacer).toBe(false);
    const r = red.construirRemonte(0, 3);
    abrir(red, 3, 0);
    red.construirRemonte(1, 3); // estrena la base 1 y desdobla la cima
    expect(red.estaciones.length).toBe(4);
    expect(red.deshacer()).toMatchObject({ tipo: 'remonte' });
    expect(red.estaciones.length).toBe(2);
    expect(red.remontes.length).toBe(1);
    expect(red.deshacer()).toMatchObject({ tipo: 'pista' });
    expect(red.enServicio(r)).toBe(false);
    red.deshacer();
    expect(red.activo(3)).toBe(false);
    expect(red.deshacer()).toBeNull();
  });

  it('la pista sale con la pendiente central de la banda del color elegido', () => {
    const red = redPequena();
    conValoresClasicos(red);
    red.construirRemonte(0, 3);
    const p = red.abrirPista(3, 0, 'azul');
    expect(p.pendiente).toBeCloseTo(0.2, 2);
    expect(p.color).toBe('azul');
  });

  it('rechaza un color que no cabe y una pareja demasiado plana', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    expect(red.puedeAbrirPista(3, 0, 'negra')).toBe('color-imposible');
    const nodos = redPequena().nodos.map((n) => ({ ...n }));
    nodos.push({ id: 4, tipo: 'intermedio', x: 2000, y: 3000, cota: 1540 }); // casi llano respecto a la base
    const llana = new Red(nodos, REGLAS);
    expect(llana.puedeConstruirRemonte(0, 4)).toBe('llegada-sin-bajada'); // tampoco se baja de 4 a ningún sitio
    llana.construirRemonte(0, 4, false);
    expect(llana.puedeAbrirPista(4, 1)).toBe('demasiado-plana');
  });

  it('una pista hacia un bucle del que no se vuelve a una base queda en espera y no pone el bucle en servicio', () => {
    const red = redPequena();
    red.construirRemonte(0, 2);
    const arriba = red.construirRemonte(2, 3);
    // 3→2 cerraría el bucle 2→3→2 sin bajada a ninguna base: queda en espera.
    const p = abrir(red, 3, 2);
    expect(red.pistaActiva(p)).toBe(false);
    expect(red.enServicio(arriba)).toBe(false);
    abrir(red, 2, 1);
    expect(red.pistaActiva(p)).toBe(true);
    expect(red.enServicio(arriba)).toBe(true);
  });

  it('una pista hacia la base de su propio remonte es viable aunque lo ponga en servicio', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    expect(red.viable(0)).toBe(true);
    expect(red.puedeAbrirPista(3, 0)).toBe('ok');
  });

  it('la primera pista de una pareja va por el lado que corta menos remontes', () => {
    const red = redPequena();
    red.construirRemonte(1, 3);
    red.construirRemonte(0, 2);
    const lado = red.ladoLibre(3, 0)!;
    const cruces = (l: 1 | -1) => red.crucesConRemontes(trazarPista(red.nodo(3), red.nodo(0), red.forma(3, 0, l), 0));
    expect(cruces(lado)).toBeLessThanOrEqual(cruces(-lado as 1 | -1));
  });

  it('la versión cambia con cada construcción y al deshacer', () => {
    const red = redPequena();
    const v0 = red.version;
    red.construirRemonte(0, 3);
    abrir(red, 3, 0);
    red.deshacer();
    expect(red.version).toBe(v0 + 3);
  });

  it('recalcular aplica los parámetros nuevos a las pistas abiertas, en su orden', () => {
    const red = redPequena();
    conValoresClasicos(red);
    red.construirRemonte(0, 3);
    red.reglas.pista.longitudOnda = 300;
    const p = red.abrirPista(3, 0, 'azul');
    const antes = p.trazado.puntos.length;
    red.reglas.pista.longitudOnda = 900;
    red.recalcularPistas();
    expect(p.trazado.puntos.length).toBeLessThan(antes); // menos ondas, menos muestras
    expect(p.color).toBe('azul');
    expect(p.fueraDeRango).toBe(false);
    expect(p.pendiente).toBeCloseTo(0.2, 2);
    expect(p.s).toBeCloseTo(p.trazado.longitud / Math.hypot(400, 3000), 10);
  });

  it('una pista cuyo color deja de caber se marca, no se borra, y se recupera', () => {
    const red = redPequena();
    conValoresClasicos(red);
    red.construirRemonte(0, 3);
    const p = red.abrirPista(3, 0, 'azul'); // pide s ≈ 1,49
    red.reglas.pista.sinuosidadMaxima = 1.2;
    red.recalcularPistas();
    expect(red.pistas).toHaveLength(1);
    expect(p.fueraDeRango).toBe(true);
    expect(p.s).toBeLessThanOrEqual(1.2 + 0.01);
    red.reglas.pista.sinuosidadMaxima = 2;
    red.recalcularPistas();
    expect(p.fueraDeRango).toBe(false);
  });

  it('recalcular rehace las confluencias solo con las pistas anteriores', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    red.construirRemonte(1, 2);
    abrir(red, 2, 1);
    abrir(red, 3, 0);
    abrir(red, 3, 0);
    for (const v of [150, 400, 900]) {
      red.reglas.pista.longitudOnda = v;
      red.recalcularPistas();
      for (const p of red.pistas) if (p.compartido) expect(p.compartido.pista).toBeLessThan(p.id);
    }
    // Deshacer sigue funcionando después de recalcular.
    red.deshacer();
    expect(red.pistas).toHaveLength(2);
  });

  it('las salidas de un punto se limitan por ángulo, no por número', () => {
    const red = redPequena();
    red.reglas.pista.distanciaMinimaPistas = 0;
    red.construirRemonte(0, 3);
    red.construirRemonte(1, 2);
    abrir(red, 2, 1);
    const p = abrir(red, 3, 0);
    // Un trazado que sale en la misma dirección que p no está separado; con ángulo 0, sí.
    red.reglas.pista.anguloMinimoSalida = 45;
    expect(red.salidaSeparada(3, 1, p.trazado)).toBe(false);
    red.reglas.pista.anguloMinimoSalida = 0;
    expect(red.salidaSeparada(3, 1, p.trazado)).toBe(true);
  });

  it('las dos laterales de un mismo remonte no cuentan entre sí para el ángulo de salida', () => {
    const red = redPequena();
    red.construirRemonte(0, 3);
    const a = abrir(red, 3, 0);
    red.reglas.pista.anguloMinimoSalida = 179;
    expect(red.salidaSeparada(3, 0, a.trazado)).toBe(true); // su pareja de lente sale casi igual y no cuenta
    expect(red.salidaSeparada(3, 1, a.trazado)).toBe(false); // otra pista cualquiera sí cuenta
  });

  it('las salidas tienen que ir cuesta abajo (o, como mucho, en horizontal)', () => {
    // Ladera plana que baja hacia +y: cota = 2400 − 0,3·y.
    const nodos = redPequena().nodos.map((n) => ({ ...n }));
    const red = new Red(nodos, { ...REGLAS, pista: { ...REGLAS.pista }, cotaTerreno: (q) => 2400 - 0.3 * q.y });
    const desde = red.nodo(3); // (400, 0)
    const recta = (dx: number, dy: number) => new Polilinea([desde, { x: desde.x + dx * 400, y: desde.y + dy * 400 }]);
    expect(red.salidaSeparada(3, 0, recta(0, 1))).toBe(true); // cuesta abajo
    expect(red.salidaSeparada(3, 0, recta(1, 0))).toBe(true); // horizontal
    expect(red.salidaSeparada(3, 0, recta(0.7, -0.7))).toBe(false); // sube
  });

  it('en una ladera plana caben 5 salidas a 45°, desde una horizontal a la otra', () => {
    const nodos = redPequena().nodos.map((n) => ({ ...n }));
    const red = new Red(nodos, { ...REGLAS, pista: { ...REGLAS.pista, anguloMinimoSalida: 45 }, cotaTerreno: (q) => 2400 - 0.3 * q.y });
    const c = red.nodo(3);
    const recta = (ang: number) => new Polilinea([c, { x: c.x + Math.cos(ang) * 400, y: c.y + Math.sin(ang) * 400 }]);
    // Cinco direcciones cuesta abajo (y creciente) separadas 45°: 0°, 45°, 90°, 135°, 180°.
    for (const [k, grados] of [0, 45, 90, 135, 180].entries()) {
      const t = recta((grados * Math.PI) / 180);
      expect(red.salidaSeparada(3, 0, t)).toBe(true);
      // Se registra como pista existente que sale del punto.
      red.pistas.push({ id: k, desde: 3, hasta: 0, lado: 1, color: 'azul', trazado: t, compartido: null, lateral: false, s: 1, fueraDeRango: false, pendiente: 0.2 });
    }
    // Una sexta, en cualquier dirección cuesta abajo, queda a menos de 45° de alguna.
    for (const grados of [10, 30, 60, 100, 160]) expect(red.salidaSeparada(3, 0, recta((grados * Math.PI) / 180))).toBe(false);
  });

  it('remontes y pistas pueden cruzarse: es un cruce solo visual', () => {
    const red = redPequena();
    red.reglas.pista.distanciaMinimaPistas = 0;
    red.construirRemonte(0, 3);
    const p = abrir(red, 3, 0);
    // Un remonte nuevo puede pasar por encima de una pista abierta.
    expect(p.trazado.longitud).toBeGreaterThan(0);
    expect(red.puedeConstruirRemonte(1, 2)).toBe('ok');
    red.reglas.pista.anguloMinimoSalida = 0; // esta prueba es de cruces, no de salidas
    // Y una pista que corta un remonte sigue siendo un trazado limpio: esta
    // pasa a la izquierda del remonte 0→3 y vuelve a la derecha para llegar a 1.
    const cruzando = new Polilinea([red.nodo(3), { x: -300, y: 1500 }, red.nodo(1)]);
    expect(red.crucesConRemontes(cruzando)).toBeGreaterThan(0);
    expect(red.trazadoLimpioDe(3, 1, { trazado: cruzando, compartido: null })).toBe(true);
  });

  it('como mucho maxPistasLlegada pistas llegando a un punto', () => {
    const red = redPequena();
    red.reglas.pista.maxPistasLlegada = 2;
    red.construirRemonte(0, 3);
    red.construirRemonte(1, 2);
    abrir(red, 2, 1);
    abrir(red, 3, 0);
    abrir(red, 3, 0);
    expect(red.puedeAbrirPista(2, 0)).toBe('destino-saturado');
  });
});
