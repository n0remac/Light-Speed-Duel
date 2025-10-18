"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // web/src/bus.ts
  function createEventBus() {
    const handlers = /* @__PURE__ */ new Map();
    return {
      on(event, handler) {
        let set = handlers.get(event);
        if (!set) {
          set = /* @__PURE__ */ new Set();
          handlers.set(event, set);
        }
        set.add(handler);
        return () => set.delete(handler);
      },
      emit(event, payload) {
        const set = handlers.get(event);
        if (!set || set.size === 0) return;
        for (const fn of set) {
          try {
            fn(payload);
          } catch (err) {
            console.error(`[bus] handler for ${event} failed`, err);
          }
        }
      }
    };
  }
  var init_bus = __esm({
    "web/src/bus.ts"() {
      "use strict";
    }
  });

  // web/src/state.ts
  function createInitialState(limits = {
    speedMin: MISSILE_MIN_SPEED,
    speedMax: MISSILE_MAX_SPEED,
    agroMin: MISSILE_MIN_AGRO
  }) {
    return {
      now: 0,
      nowSyncedAt: typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now(),
      me: null,
      ghosts: [],
      missiles: [],
      missileRoutes: [],
      activeMissileRouteId: null,
      nextMissileReadyAt: 0,
      missileConfig: {
        speed: 180,
        agroRadius: 800,
        lifetime: missileLifetimeFor(180, 800, limits),
        heatParams: MISSILE_PRESETS[1].heatParams
        // Default to Hunter preset
      },
      missileLimits: limits,
      worldMeta: {},
      inventory: null,
      dag: null,
      mission: null,
      story: null,
      craftHeatCapacity: 80,
      // Default to basic missile heat capacity
      capabilities: null
    };
  }
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function missileLifetimeFor(speed, agroRadius, limits = {
    speedMin: MISSILE_MIN_SPEED,
    speedMax: MISSILE_MAX_SPEED,
    agroMin: MISSILE_MIN_AGRO
  }) {
    const minSpeed = Number.isFinite(limits.speedMin) ? limits.speedMin : MISSILE_MIN_SPEED;
    const maxSpeed = Number.isFinite(limits.speedMax) ? limits.speedMax : MISSILE_MAX_SPEED;
    const minAgro = Number.isFinite(limits.agroMin) ? limits.agroMin : MISSILE_MIN_AGRO;
    const span = maxSpeed - minSpeed;
    const speedNorm = span > 0 ? clamp((speed - minSpeed) / span, 0, 1) : 0;
    const adjustedAgro = Math.max(0, agroRadius - minAgro);
    const agroNorm = clamp(adjustedAgro / MISSILE_LIFETIME_AGRO_REF, 0, 1);
    const reduction = speedNorm * MISSILE_LIFETIME_SPEED_PENALTY + agroNorm * MISSILE_LIFETIME_AGRO_PENALTY;
    const base = MISSILE_MAX_LIFETIME;
    return clamp(base - reduction, MISSILE_MIN_LIFETIME, MISSILE_MAX_LIFETIME);
  }
  function sanitizeMissileConfig(cfg, fallback, limits) {
    var _a, _b, _c, _d;
    const minSpeed = Number.isFinite(limits.speedMin) ? limits.speedMin : MISSILE_MIN_SPEED;
    const maxSpeed = Number.isFinite(limits.speedMax) ? limits.speedMax : MISSILE_MAX_SPEED;
    const minAgro = Number.isFinite(limits.agroMin) ? limits.agroMin : MISSILE_MIN_AGRO;
    const base = fallback != null ? fallback : {
      speed: minSpeed,
      agroRadius: minAgro,
      lifetime: missileLifetimeFor(minSpeed, minAgro, limits)
    };
    const mergedSpeed = Number.isFinite((_a = cfg.speed) != null ? _a : base.speed) ? (_b = cfg.speed) != null ? _b : base.speed : base.speed;
    const mergedAgro = Number.isFinite((_c = cfg.agroRadius) != null ? _c : base.agroRadius) ? (_d = cfg.agroRadius) != null ? _d : base.agroRadius : base.agroRadius;
    const speed = clamp(mergedSpeed, minSpeed, maxSpeed);
    const agroRadius = Math.max(minAgro, mergedAgro);
    const heatParams = cfg.heatParams ? { ...cfg.heatParams } : base.heatParams ? { ...base.heatParams } : void 0;
    return {
      speed,
      agroRadius,
      lifetime: missileLifetimeFor(speed, agroRadius, limits),
      heatParams
    };
  }
  function monotonicNow() {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }
  function updateMissileLimits(state, limits) {
    state.missileLimits = {
      speedMin: Number.isFinite(limits.speedMin) ? limits.speedMin : state.missileLimits.speedMin,
      speedMax: Number.isFinite(limits.speedMax) ? limits.speedMax : state.missileLimits.speedMax,
      agroMin: Number.isFinite(limits.agroMin) ? limits.agroMin : state.missileLimits.agroMin
    };
  }
  var MISSILE_MIN_SPEED, MISSILE_MAX_SPEED, MISSILE_MIN_AGRO, MISSILE_MAX_LIFETIME, MISSILE_MIN_LIFETIME, MISSILE_LIFETIME_SPEED_PENALTY, MISSILE_LIFETIME_AGRO_PENALTY, MISSILE_LIFETIME_AGRO_REF, MISSILE_PRESETS;
  var init_state = __esm({
    "web/src/state.ts"() {
      "use strict";
      MISSILE_MIN_SPEED = 40;
      MISSILE_MAX_SPEED = 250;
      MISSILE_MIN_AGRO = 100;
      MISSILE_MAX_LIFETIME = 120;
      MISSILE_MIN_LIFETIME = 20;
      MISSILE_LIFETIME_SPEED_PENALTY = 80;
      MISSILE_LIFETIME_AGRO_PENALTY = 40;
      MISSILE_LIFETIME_AGRO_REF = 2e3;
      MISSILE_PRESETS = [
        {
          name: "Scout",
          description: "Slow, efficient, long-range. High heat capacity.",
          speed: 80,
          agroRadius: 1500,
          heatParams: {
            max: 60,
            warnAt: 42,
            overheatAt: 60,
            markerSpeed: 70,
            kUp: 20,
            kDown: 15,
            exp: 1.5
          }
        },
        {
          name: "Hunter",
          description: "Balanced speed and detection. Standard heat.",
          speed: 150,
          agroRadius: 800,
          heatParams: {
            max: 50,
            warnAt: 35,
            overheatAt: 50,
            markerSpeed: 120,
            kUp: 28,
            kDown: 12,
            exp: 1.5
          }
        },
        {
          name: "Sniper",
          description: "Fast, narrow detection. Low heat capacity.",
          speed: 220,
          agroRadius: 300,
          heatParams: {
            max: 40,
            warnAt: 28,
            overheatAt: 40,
            markerSpeed: 180,
            kUp: 35,
            kDown: 8,
            exp: 1.5
          }
        }
      ];
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/types.js
  var init_types = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/types.js"() {
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/is-message.js
  function isMessage(arg, schema) {
    const isMessage2 = arg !== null && typeof arg == "object" && "$typeName" in arg && typeof arg.$typeName == "string";
    if (!isMessage2) {
      return false;
    }
    if (schema === void 0) {
      return true;
    }
    return schema.typeName === arg.$typeName;
  }
  var init_is_message = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/is-message.js"() {
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/descriptors.js
  var ScalarType;
  var init_descriptors = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/descriptors.js"() {
      (function(ScalarType2) {
        ScalarType2[ScalarType2["DOUBLE"] = 1] = "DOUBLE";
        ScalarType2[ScalarType2["FLOAT"] = 2] = "FLOAT";
        ScalarType2[ScalarType2["INT64"] = 3] = "INT64";
        ScalarType2[ScalarType2["UINT64"] = 4] = "UINT64";
        ScalarType2[ScalarType2["INT32"] = 5] = "INT32";
        ScalarType2[ScalarType2["FIXED64"] = 6] = "FIXED64";
        ScalarType2[ScalarType2["FIXED32"] = 7] = "FIXED32";
        ScalarType2[ScalarType2["BOOL"] = 8] = "BOOL";
        ScalarType2[ScalarType2["STRING"] = 9] = "STRING";
        ScalarType2[ScalarType2["BYTES"] = 12] = "BYTES";
        ScalarType2[ScalarType2["UINT32"] = 13] = "UINT32";
        ScalarType2[ScalarType2["SFIXED32"] = 15] = "SFIXED32";
        ScalarType2[ScalarType2["SFIXED64"] = 16] = "SFIXED64";
        ScalarType2[ScalarType2["SINT32"] = 17] = "SINT32";
        ScalarType2[ScalarType2["SINT64"] = 18] = "SINT64";
      })(ScalarType || (ScalarType = {}));
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/wire/varint.js
  function varint64read() {
    let lowBits = 0;
    let highBits = 0;
    for (let shift = 0; shift < 28; shift += 7) {
      let b = this.buf[this.pos++];
      lowBits |= (b & 127) << shift;
      if ((b & 128) == 0) {
        this.assertBounds();
        return [lowBits, highBits];
      }
    }
    let middleByte = this.buf[this.pos++];
    lowBits |= (middleByte & 15) << 28;
    highBits = (middleByte & 112) >> 4;
    if ((middleByte & 128) == 0) {
      this.assertBounds();
      return [lowBits, highBits];
    }
    for (let shift = 3; shift <= 31; shift += 7) {
      let b = this.buf[this.pos++];
      highBits |= (b & 127) << shift;
      if ((b & 128) == 0) {
        this.assertBounds();
        return [lowBits, highBits];
      }
    }
    throw new Error("invalid varint");
  }
  function varint64write(lo, hi, bytes) {
    for (let i = 0; i < 28; i = i + 7) {
      const shift = lo >>> i;
      const hasNext = !(shift >>> 7 == 0 && hi == 0);
      const byte = (hasNext ? shift | 128 : shift) & 255;
      bytes.push(byte);
      if (!hasNext) {
        return;
      }
    }
    const splitBits = lo >>> 28 & 15 | (hi & 7) << 4;
    const hasMoreBits = !(hi >> 3 == 0);
    bytes.push((hasMoreBits ? splitBits | 128 : splitBits) & 255);
    if (!hasMoreBits) {
      return;
    }
    for (let i = 3; i < 31; i = i + 7) {
      const shift = hi >>> i;
      const hasNext = !(shift >>> 7 == 0);
      const byte = (hasNext ? shift | 128 : shift) & 255;
      bytes.push(byte);
      if (!hasNext) {
        return;
      }
    }
    bytes.push(hi >>> 31 & 1);
  }
  function int64FromString(dec) {
    const minus = dec[0] === "-";
    if (minus) {
      dec = dec.slice(1);
    }
    const base = 1e6;
    let lowBits = 0;
    let highBits = 0;
    function add1e6digit(begin, end) {
      const digit1e6 = Number(dec.slice(begin, end));
      highBits *= base;
      lowBits = lowBits * base + digit1e6;
      if (lowBits >= TWO_PWR_32_DBL) {
        highBits = highBits + (lowBits / TWO_PWR_32_DBL | 0);
        lowBits = lowBits % TWO_PWR_32_DBL;
      }
    }
    add1e6digit(-24, -18);
    add1e6digit(-18, -12);
    add1e6digit(-12, -6);
    add1e6digit(-6);
    return minus ? negate(lowBits, highBits) : newBits(lowBits, highBits);
  }
  function int64ToString(lo, hi) {
    let bits = newBits(lo, hi);
    const negative = bits.hi & 2147483648;
    if (negative) {
      bits = negate(bits.lo, bits.hi);
    }
    const result = uInt64ToString(bits.lo, bits.hi);
    return negative ? "-" + result : result;
  }
  function uInt64ToString(lo, hi) {
    ({ lo, hi } = toUnsigned(lo, hi));
    if (hi <= 2097151) {
      return String(TWO_PWR_32_DBL * hi + lo);
    }
    const low = lo & 16777215;
    const mid = (lo >>> 24 | hi << 8) & 16777215;
    const high = hi >> 16 & 65535;
    let digitA = low + mid * 6777216 + high * 6710656;
    let digitB = mid + high * 8147497;
    let digitC = high * 2;
    const base = 1e7;
    if (digitA >= base) {
      digitB += Math.floor(digitA / base);
      digitA %= base;
    }
    if (digitB >= base) {
      digitC += Math.floor(digitB / base);
      digitB %= base;
    }
    return digitC.toString() + decimalFrom1e7WithLeadingZeros(digitB) + decimalFrom1e7WithLeadingZeros(digitA);
  }
  function toUnsigned(lo, hi) {
    return { lo: lo >>> 0, hi: hi >>> 0 };
  }
  function newBits(lo, hi) {
    return { lo: lo | 0, hi: hi | 0 };
  }
  function negate(lowBits, highBits) {
    highBits = ~highBits;
    if (lowBits) {
      lowBits = ~lowBits + 1;
    } else {
      highBits += 1;
    }
    return newBits(lowBits, highBits);
  }
  function varint32write(value, bytes) {
    if (value >= 0) {
      while (value > 127) {
        bytes.push(value & 127 | 128);
        value = value >>> 7;
      }
      bytes.push(value);
    } else {
      for (let i = 0; i < 9; i++) {
        bytes.push(value & 127 | 128);
        value = value >> 7;
      }
      bytes.push(1);
    }
  }
  function varint32read() {
    let b = this.buf[this.pos++];
    let result = b & 127;
    if ((b & 128) == 0) {
      this.assertBounds();
      return result;
    }
    b = this.buf[this.pos++];
    result |= (b & 127) << 7;
    if ((b & 128) == 0) {
      this.assertBounds();
      return result;
    }
    b = this.buf[this.pos++];
    result |= (b & 127) << 14;
    if ((b & 128) == 0) {
      this.assertBounds();
      return result;
    }
    b = this.buf[this.pos++];
    result |= (b & 127) << 21;
    if ((b & 128) == 0) {
      this.assertBounds();
      return result;
    }
    b = this.buf[this.pos++];
    result |= (b & 15) << 28;
    for (let readBytes = 5; (b & 128) !== 0 && readBytes < 10; readBytes++)
      b = this.buf[this.pos++];
    if ((b & 128) != 0)
      throw new Error("invalid varint");
    this.assertBounds();
    return result >>> 0;
  }
  var TWO_PWR_32_DBL, decimalFrom1e7WithLeadingZeros;
  var init_varint = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/wire/varint.js"() {
      TWO_PWR_32_DBL = 4294967296;
      decimalFrom1e7WithLeadingZeros = (digit1e7) => {
        const partial = String(digit1e7);
        return "0000000".slice(partial.length) + partial;
      };
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/proto-int64.js
  function makeInt64Support() {
    const dv = new DataView(new ArrayBuffer(8));
    const ok = typeof BigInt === "function" && typeof dv.getBigInt64 === "function" && typeof dv.getBigUint64 === "function" && typeof dv.setBigInt64 === "function" && typeof dv.setBigUint64 === "function" && (!!globalThis.Deno || typeof process != "object" || typeof process.env != "object" || process.env.BUF_BIGINT_DISABLE !== "1");
    if (ok) {
      const MIN = BigInt("-9223372036854775808");
      const MAX = BigInt("9223372036854775807");
      const UMIN = BigInt("0");
      const UMAX = BigInt("18446744073709551615");
      return {
        zero: BigInt(0),
        supported: true,
        parse(value) {
          const bi = typeof value == "bigint" ? value : BigInt(value);
          if (bi > MAX || bi < MIN) {
            throw new Error(`invalid int64: ${value}`);
          }
          return bi;
        },
        uParse(value) {
          const bi = typeof value == "bigint" ? value : BigInt(value);
          if (bi > UMAX || bi < UMIN) {
            throw new Error(`invalid uint64: ${value}`);
          }
          return bi;
        },
        enc(value) {
          dv.setBigInt64(0, this.parse(value), true);
          return {
            lo: dv.getInt32(0, true),
            hi: dv.getInt32(4, true)
          };
        },
        uEnc(value) {
          dv.setBigInt64(0, this.uParse(value), true);
          return {
            lo: dv.getInt32(0, true),
            hi: dv.getInt32(4, true)
          };
        },
        dec(lo, hi) {
          dv.setInt32(0, lo, true);
          dv.setInt32(4, hi, true);
          return dv.getBigInt64(0, true);
        },
        uDec(lo, hi) {
          dv.setInt32(0, lo, true);
          dv.setInt32(4, hi, true);
          return dv.getBigUint64(0, true);
        }
      };
    }
    return {
      zero: "0",
      supported: false,
      parse(value) {
        if (typeof value != "string") {
          value = value.toString();
        }
        assertInt64String(value);
        return value;
      },
      uParse(value) {
        if (typeof value != "string") {
          value = value.toString();
        }
        assertUInt64String(value);
        return value;
      },
      enc(value) {
        if (typeof value != "string") {
          value = value.toString();
        }
        assertInt64String(value);
        return int64FromString(value);
      },
      uEnc(value) {
        if (typeof value != "string") {
          value = value.toString();
        }
        assertUInt64String(value);
        return int64FromString(value);
      },
      dec(lo, hi) {
        return int64ToString(lo, hi);
      },
      uDec(lo, hi) {
        return uInt64ToString(lo, hi);
      }
    };
  }
  function assertInt64String(value) {
    if (!/^-?[0-9]+$/.test(value)) {
      throw new Error("invalid int64: " + value);
    }
  }
  function assertUInt64String(value) {
    if (!/^[0-9]+$/.test(value)) {
      throw new Error("invalid uint64: " + value);
    }
  }
  var protoInt64;
  var init_proto_int64 = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/proto-int64.js"() {
      init_varint();
      protoInt64 = /* @__PURE__ */ makeInt64Support();
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/reflect/scalar.js
  function scalarZeroValue(type, longAsString) {
    switch (type) {
      case ScalarType.STRING:
        return "";
      case ScalarType.BOOL:
        return false;
      case ScalarType.DOUBLE:
      case ScalarType.FLOAT:
        return 0;
      case ScalarType.INT64:
      case ScalarType.UINT64:
      case ScalarType.SFIXED64:
      case ScalarType.FIXED64:
      case ScalarType.SINT64:
        return longAsString ? "0" : protoInt64.zero;
      case ScalarType.BYTES:
        return new Uint8Array(0);
      default:
        return 0;
    }
  }
  function isScalarZeroValue(type, value) {
    switch (type) {
      case ScalarType.BOOL:
        return value === false;
      case ScalarType.STRING:
        return value === "";
      case ScalarType.BYTES:
        return value instanceof Uint8Array && !value.byteLength;
      default:
        return value == 0;
    }
  }
  var init_scalar = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/reflect/scalar.js"() {
      init_proto_int64();
      init_descriptors();
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/reflect/unsafe.js
  function unsafeOneofCase(target, oneof) {
    const c = target[oneof.localName].case;
    if (c === void 0) {
      return c;
    }
    return oneof.fields.find((f) => f.localName === c);
  }
  function unsafeIsSet(target, field) {
    const name = field.localName;
    if (field.oneof) {
      return target[field.oneof.localName].case === name;
    }
    if (field.presence != IMPLICIT) {
      return target[name] !== void 0 && Object.prototype.hasOwnProperty.call(target, name);
    }
    switch (field.fieldKind) {
      case "list":
        return target[name].length > 0;
      case "map":
        return Object.keys(target[name]).length > 0;
      case "scalar":
        return !isScalarZeroValue(field.scalar, target[name]);
      case "enum":
        return target[name] !== field.enum.values[0].number;
    }
    throw new Error("message field with implicit presence");
  }
  function unsafeIsSetExplicit(target, localName) {
    return Object.prototype.hasOwnProperty.call(target, localName) && target[localName] !== void 0;
  }
  function unsafeGet(target, field) {
    if (field.oneof) {
      const oneof = target[field.oneof.localName];
      if (oneof.case === field.localName) {
        return oneof.value;
      }
      return void 0;
    }
    return target[field.localName];
  }
  function unsafeSet(target, field, value) {
    if (field.oneof) {
      target[field.oneof.localName] = {
        case: field.localName,
        value
      };
    } else {
      target[field.localName] = value;
    }
  }
  function unsafeClear(target, field) {
    const name = field.localName;
    if (field.oneof) {
      const oneofLocalName = field.oneof.localName;
      if (target[oneofLocalName].case === name) {
        target[oneofLocalName] = { case: void 0 };
      }
    } else if (field.presence != IMPLICIT) {
      delete target[name];
    } else {
      switch (field.fieldKind) {
        case "map":
          target[name] = {};
          break;
        case "list":
          target[name] = [];
          break;
        case "enum":
          target[name] = field.enum.values[0].number;
          break;
        case "scalar":
          target[name] = scalarZeroValue(field.scalar, field.longAsString);
          break;
      }
    }
  }
  var IMPLICIT, unsafeLocal;
  var init_unsafe = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/reflect/unsafe.js"() {
      init_scalar();
      IMPLICIT = 2;
      unsafeLocal = Symbol.for("reflect unsafe local");
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/reflect/guard.js
  function isObject(arg) {
    return arg !== null && typeof arg == "object" && !Array.isArray(arg);
  }
  function isReflectList(arg, field) {
    var _a, _b, _c, _d;
    if (isObject(arg) && unsafeLocal in arg && "add" in arg && "field" in arg && typeof arg.field == "function") {
      if (field !== void 0) {
        const a = field;
        const b = arg.field();
        return a.listKind == b.listKind && a.scalar === b.scalar && ((_a = a.message) === null || _a === void 0 ? void 0 : _a.typeName) === ((_b = b.message) === null || _b === void 0 ? void 0 : _b.typeName) && ((_c = a.enum) === null || _c === void 0 ? void 0 : _c.typeName) === ((_d = b.enum) === null || _d === void 0 ? void 0 : _d.typeName);
      }
      return true;
    }
    return false;
  }
  function isReflectMap(arg, field) {
    var _a, _b, _c, _d;
    if (isObject(arg) && unsafeLocal in arg && "has" in arg && "field" in arg && typeof arg.field == "function") {
      if (field !== void 0) {
        const a = field, b = arg.field();
        return a.mapKey === b.mapKey && a.mapKind == b.mapKind && a.scalar === b.scalar && ((_a = a.message) === null || _a === void 0 ? void 0 : _a.typeName) === ((_b = b.message) === null || _b === void 0 ? void 0 : _b.typeName) && ((_c = a.enum) === null || _c === void 0 ? void 0 : _c.typeName) === ((_d = b.enum) === null || _d === void 0 ? void 0 : _d.typeName);
      }
      return true;
    }
    return false;
  }
  function isReflectMessage(arg, messageDesc2) {
    return isObject(arg) && unsafeLocal in arg && "desc" in arg && isObject(arg.desc) && arg.desc.kind === "message" && (messageDesc2 === void 0 || arg.desc.typeName == messageDesc2.typeName);
  }
  var init_guard = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/reflect/guard.js"() {
      init_unsafe();
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/wkt/wrappers.js
  function isWrapper(arg) {
    return isWrapperTypeName(arg.$typeName);
  }
  function isWrapperDesc(messageDesc2) {
    const f = messageDesc2.fields[0];
    return isWrapperTypeName(messageDesc2.typeName) && f !== void 0 && f.fieldKind == "scalar" && f.name == "value" && f.number == 1;
  }
  function isWrapperTypeName(name) {
    return name.startsWith("google.protobuf.") && [
      "DoubleValue",
      "FloatValue",
      "Int64Value",
      "UInt64Value",
      "Int32Value",
      "UInt32Value",
      "BoolValue",
      "StringValue",
      "BytesValue"
    ].includes(name.substring(16));
  }
  var init_wrappers = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/wkt/wrappers.js"() {
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/create.js
  function create(schema, init) {
    if (isMessage(init, schema)) {
      return init;
    }
    const message = createZeroMessage(schema);
    if (init !== void 0) {
      initMessage(schema, message, init);
    }
    return message;
  }
  function initMessage(messageDesc2, message, init) {
    for (const member of messageDesc2.members) {
      let value = init[member.localName];
      if (value == null) {
        continue;
      }
      let field;
      if (member.kind == "oneof") {
        const oneofField = unsafeOneofCase(init, member);
        if (!oneofField) {
          continue;
        }
        field = oneofField;
        value = unsafeGet(init, oneofField);
      } else {
        field = member;
      }
      switch (field.fieldKind) {
        case "message":
          value = toMessage(field, value);
          break;
        case "scalar":
          value = initScalar(field, value);
          break;
        case "list":
          value = initList(field, value);
          break;
        case "map":
          value = initMap(field, value);
          break;
      }
      unsafeSet(message, field, value);
    }
    return message;
  }
  function initScalar(field, value) {
    if (field.scalar == ScalarType.BYTES) {
      return toU8Arr(value);
    }
    return value;
  }
  function initMap(field, value) {
    if (isObject(value)) {
      if (field.scalar == ScalarType.BYTES) {
        return convertObjectValues(value, toU8Arr);
      }
      if (field.mapKind == "message") {
        return convertObjectValues(value, (val) => toMessage(field, val));
      }
    }
    return value;
  }
  function initList(field, value) {
    if (Array.isArray(value)) {
      if (field.scalar == ScalarType.BYTES) {
        return value.map(toU8Arr);
      }
      if (field.listKind == "message") {
        return value.map((item) => toMessage(field, item));
      }
    }
    return value;
  }
  function toMessage(field, value) {
    if (field.fieldKind == "message" && !field.oneof && isWrapperDesc(field.message)) {
      return initScalar(field.message.fields[0], value);
    }
    if (isObject(value)) {
      if (field.message.typeName == "google.protobuf.Struct" && field.parent.typeName !== "google.protobuf.Value") {
        return value;
      }
      if (!isMessage(value, field.message)) {
        return create(field.message, value);
      }
    }
    return value;
  }
  function toU8Arr(value) {
    return Array.isArray(value) ? new Uint8Array(value) : value;
  }
  function convertObjectValues(obj, fn) {
    const ret = {};
    for (const entry of Object.entries(obj)) {
      ret[entry[0]] = fn(entry[1]);
    }
    return ret;
  }
  function createZeroMessage(desc) {
    let msg;
    if (!needsPrototypeChain(desc)) {
      msg = {
        $typeName: desc.typeName
      };
      for (const member of desc.members) {
        if (member.kind == "oneof" || member.presence == IMPLICIT2) {
          msg[member.localName] = createZeroField(member);
        }
      }
    } else {
      const cached = messagePrototypes.get(desc);
      let prototype;
      let members;
      if (cached) {
        ({ prototype, members } = cached);
      } else {
        prototype = {};
        members = /* @__PURE__ */ new Set();
        for (const member of desc.members) {
          if (member.kind == "oneof") {
            continue;
          }
          if (member.fieldKind != "scalar" && member.fieldKind != "enum") {
            continue;
          }
          if (member.presence == IMPLICIT2) {
            continue;
          }
          members.add(member);
          prototype[member.localName] = createZeroField(member);
        }
        messagePrototypes.set(desc, { prototype, members });
      }
      msg = Object.create(prototype);
      msg.$typeName = desc.typeName;
      for (const member of desc.members) {
        if (members.has(member)) {
          continue;
        }
        if (member.kind == "field") {
          if (member.fieldKind == "message") {
            continue;
          }
          if (member.fieldKind == "scalar" || member.fieldKind == "enum") {
            if (member.presence != IMPLICIT2) {
              continue;
            }
          }
        }
        msg[member.localName] = createZeroField(member);
      }
    }
    return msg;
  }
  function needsPrototypeChain(desc) {
    switch (desc.file.edition) {
      case EDITION_PROTO3:
        return false;
      case EDITION_PROTO2:
        return true;
      default:
        return desc.fields.some((f) => f.presence != IMPLICIT2 && f.fieldKind != "message" && !f.oneof);
    }
  }
  function createZeroField(field) {
    if (field.kind == "oneof") {
      return { case: void 0 };
    }
    if (field.fieldKind == "list") {
      return [];
    }
    if (field.fieldKind == "map") {
      return {};
    }
    if (field.fieldKind == "message") {
      return tokenZeroMessageField;
    }
    const defaultValue = field.getDefaultValue();
    if (defaultValue !== void 0) {
      return field.fieldKind == "scalar" && field.longAsString ? defaultValue.toString() : defaultValue;
    }
    return field.fieldKind == "scalar" ? scalarZeroValue(field.scalar, field.longAsString) : field.enum.values[0].number;
  }
  var EDITION_PROTO3, EDITION_PROTO2, IMPLICIT2, tokenZeroMessageField, messagePrototypes;
  var init_create = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/create.js"() {
      init_is_message();
      init_descriptors();
      init_scalar();
      init_guard();
      init_unsafe();
      init_wrappers();
      EDITION_PROTO3 = 999;
      EDITION_PROTO2 = 998;
      IMPLICIT2 = 2;
      tokenZeroMessageField = Symbol();
      messagePrototypes = /* @__PURE__ */ new WeakMap();
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/reflect/error.js
  var FieldError;
  var init_error = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/reflect/error.js"() {
      FieldError = class extends Error {
        constructor(fieldOrOneof, message, name = "FieldValueInvalidError") {
          super(message);
          this.name = name;
          this.field = () => fieldOrOneof;
        }
      };
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/wire/text-encoding.js
  function getTextEncoding() {
    if (globalThis[symbol] == void 0) {
      const te = new globalThis.TextEncoder();
      const td = new globalThis.TextDecoder();
      globalThis[symbol] = {
        encodeUtf8(text) {
          return te.encode(text);
        },
        decodeUtf8(bytes) {
          return td.decode(bytes);
        },
        checkUtf8(text) {
          try {
            encodeURIComponent(text);
            return true;
          } catch (_) {
            return false;
          }
        }
      };
    }
    return globalThis[symbol];
  }
  var symbol;
  var init_text_encoding = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/wire/text-encoding.js"() {
      symbol = Symbol.for("@bufbuild/protobuf/text-encoding");
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/wire/binary-encoding.js
  function assertInt32(arg) {
    if (typeof arg == "string") {
      arg = Number(arg);
    } else if (typeof arg != "number") {
      throw new Error("invalid int32: " + typeof arg);
    }
    if (!Number.isInteger(arg) || arg > INT32_MAX || arg < INT32_MIN)
      throw new Error("invalid int32: " + arg);
  }
  function assertUInt32(arg) {
    if (typeof arg == "string") {
      arg = Number(arg);
    } else if (typeof arg != "number") {
      throw new Error("invalid uint32: " + typeof arg);
    }
    if (!Number.isInteger(arg) || arg > UINT32_MAX || arg < 0)
      throw new Error("invalid uint32: " + arg);
  }
  function assertFloat32(arg) {
    if (typeof arg == "string") {
      const o = arg;
      arg = Number(arg);
      if (Number.isNaN(arg) && o !== "NaN") {
        throw new Error("invalid float32: " + o);
      }
    } else if (typeof arg != "number") {
      throw new Error("invalid float32: " + typeof arg);
    }
    if (Number.isFinite(arg) && (arg > FLOAT32_MAX || arg < FLOAT32_MIN))
      throw new Error("invalid float32: " + arg);
  }
  var WireType, FLOAT32_MAX, FLOAT32_MIN, UINT32_MAX, INT32_MAX, INT32_MIN, BinaryWriter, BinaryReader;
  var init_binary_encoding = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/wire/binary-encoding.js"() {
      init_varint();
      init_proto_int64();
      init_text_encoding();
      (function(WireType2) {
        WireType2[WireType2["Varint"] = 0] = "Varint";
        WireType2[WireType2["Bit64"] = 1] = "Bit64";
        WireType2[WireType2["LengthDelimited"] = 2] = "LengthDelimited";
        WireType2[WireType2["StartGroup"] = 3] = "StartGroup";
        WireType2[WireType2["EndGroup"] = 4] = "EndGroup";
        WireType2[WireType2["Bit32"] = 5] = "Bit32";
      })(WireType || (WireType = {}));
      FLOAT32_MAX = 34028234663852886e22;
      FLOAT32_MIN = -34028234663852886e22;
      UINT32_MAX = 4294967295;
      INT32_MAX = 2147483647;
      INT32_MIN = -2147483648;
      BinaryWriter = class {
        constructor(encodeUtf8 = getTextEncoding().encodeUtf8) {
          this.encodeUtf8 = encodeUtf8;
          this.stack = [];
          this.chunks = [];
          this.buf = [];
        }
        /**
         * Return all bytes written and reset this writer.
         */
        finish() {
          if (this.buf.length) {
            this.chunks.push(new Uint8Array(this.buf));
            this.buf = [];
          }
          let len = 0;
          for (let i = 0; i < this.chunks.length; i++)
            len += this.chunks[i].length;
          let bytes = new Uint8Array(len);
          let offset = 0;
          for (let i = 0; i < this.chunks.length; i++) {
            bytes.set(this.chunks[i], offset);
            offset += this.chunks[i].length;
          }
          this.chunks = [];
          return bytes;
        }
        /**
         * Start a new fork for length-delimited data like a message
         * or a packed repeated field.
         *
         * Must be joined later with `join()`.
         */
        fork() {
          this.stack.push({ chunks: this.chunks, buf: this.buf });
          this.chunks = [];
          this.buf = [];
          return this;
        }
        /**
         * Join the last fork. Write its length and bytes, then
         * return to the previous state.
         */
        join() {
          let chunk = this.finish();
          let prev = this.stack.pop();
          if (!prev)
            throw new Error("invalid state, fork stack empty");
          this.chunks = prev.chunks;
          this.buf = prev.buf;
          this.uint32(chunk.byteLength);
          return this.raw(chunk);
        }
        /**
         * Writes a tag (field number and wire type).
         *
         * Equivalent to `uint32( (fieldNo << 3 | type) >>> 0 )`.
         *
         * Generated code should compute the tag ahead of time and call `uint32()`.
         */
        tag(fieldNo, type) {
          return this.uint32((fieldNo << 3 | type) >>> 0);
        }
        /**
         * Write a chunk of raw bytes.
         */
        raw(chunk) {
          if (this.buf.length) {
            this.chunks.push(new Uint8Array(this.buf));
            this.buf = [];
          }
          this.chunks.push(chunk);
          return this;
        }
        /**
         * Write a `uint32` value, an unsigned 32 bit varint.
         */
        uint32(value) {
          assertUInt32(value);
          while (value > 127) {
            this.buf.push(value & 127 | 128);
            value = value >>> 7;
          }
          this.buf.push(value);
          return this;
        }
        /**
         * Write a `int32` value, a signed 32 bit varint.
         */
        int32(value) {
          assertInt32(value);
          varint32write(value, this.buf);
          return this;
        }
        /**
         * Write a `bool` value, a variant.
         */
        bool(value) {
          this.buf.push(value ? 1 : 0);
          return this;
        }
        /**
         * Write a `bytes` value, length-delimited arbitrary data.
         */
        bytes(value) {
          this.uint32(value.byteLength);
          return this.raw(value);
        }
        /**
         * Write a `string` value, length-delimited data converted to UTF-8 text.
         */
        string(value) {
          let chunk = this.encodeUtf8(value);
          this.uint32(chunk.byteLength);
          return this.raw(chunk);
        }
        /**
         * Write a `float` value, 32-bit floating point number.
         */
        float(value) {
          assertFloat32(value);
          let chunk = new Uint8Array(4);
          new DataView(chunk.buffer).setFloat32(0, value, true);
          return this.raw(chunk);
        }
        /**
         * Write a `double` value, a 64-bit floating point number.
         */
        double(value) {
          let chunk = new Uint8Array(8);
          new DataView(chunk.buffer).setFloat64(0, value, true);
          return this.raw(chunk);
        }
        /**
         * Write a `fixed32` value, an unsigned, fixed-length 32-bit integer.
         */
        fixed32(value) {
          assertUInt32(value);
          let chunk = new Uint8Array(4);
          new DataView(chunk.buffer).setUint32(0, value, true);
          return this.raw(chunk);
        }
        /**
         * Write a `sfixed32` value, a signed, fixed-length 32-bit integer.
         */
        sfixed32(value) {
          assertInt32(value);
          let chunk = new Uint8Array(4);
          new DataView(chunk.buffer).setInt32(0, value, true);
          return this.raw(chunk);
        }
        /**
         * Write a `sint32` value, a signed, zigzag-encoded 32-bit varint.
         */
        sint32(value) {
          assertInt32(value);
          value = (value << 1 ^ value >> 31) >>> 0;
          varint32write(value, this.buf);
          return this;
        }
        /**
         * Write a `fixed64` value, a signed, fixed-length 64-bit integer.
         */
        sfixed64(value) {
          let chunk = new Uint8Array(8), view = new DataView(chunk.buffer), tc = protoInt64.enc(value);
          view.setInt32(0, tc.lo, true);
          view.setInt32(4, tc.hi, true);
          return this.raw(chunk);
        }
        /**
         * Write a `fixed64` value, an unsigned, fixed-length 64 bit integer.
         */
        fixed64(value) {
          let chunk = new Uint8Array(8), view = new DataView(chunk.buffer), tc = protoInt64.uEnc(value);
          view.setInt32(0, tc.lo, true);
          view.setInt32(4, tc.hi, true);
          return this.raw(chunk);
        }
        /**
         * Write a `int64` value, a signed 64-bit varint.
         */
        int64(value) {
          let tc = protoInt64.enc(value);
          varint64write(tc.lo, tc.hi, this.buf);
          return this;
        }
        /**
         * Write a `sint64` value, a signed, zig-zag-encoded 64-bit varint.
         */
        sint64(value) {
          const tc = protoInt64.enc(value), sign = tc.hi >> 31, lo = tc.lo << 1 ^ sign, hi = (tc.hi << 1 | tc.lo >>> 31) ^ sign;
          varint64write(lo, hi, this.buf);
          return this;
        }
        /**
         * Write a `uint64` value, an unsigned 64-bit varint.
         */
        uint64(value) {
          const tc = protoInt64.uEnc(value);
          varint64write(tc.lo, tc.hi, this.buf);
          return this;
        }
      };
      BinaryReader = class {
        constructor(buf, decodeUtf8 = getTextEncoding().decodeUtf8) {
          this.decodeUtf8 = decodeUtf8;
          this.varint64 = varint64read;
          this.uint32 = varint32read;
          this.buf = buf;
          this.len = buf.length;
          this.pos = 0;
          this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        }
        /**
         * Reads a tag - field number and wire type.
         */
        tag() {
          let tag = this.uint32(), fieldNo = tag >>> 3, wireType = tag & 7;
          if (fieldNo <= 0 || wireType < 0 || wireType > 5)
            throw new Error("illegal tag: field no " + fieldNo + " wire type " + wireType);
          return [fieldNo, wireType];
        }
        /**
         * Skip one element and return the skipped data.
         *
         * When skipping StartGroup, provide the tags field number to check for
         * matching field number in the EndGroup tag.
         */
        skip(wireType, fieldNo) {
          let start = this.pos;
          switch (wireType) {
            case WireType.Varint:
              while (this.buf[this.pos++] & 128) {
              }
              break;
            case WireType.Bit64:
              this.pos += 4;
            case WireType.Bit32:
              this.pos += 4;
              break;
            case WireType.LengthDelimited:
              let len = this.uint32();
              this.pos += len;
              break;
            case WireType.StartGroup:
              for (; ; ) {
                const [fn, wt] = this.tag();
                if (wt === WireType.EndGroup) {
                  if (fieldNo !== void 0 && fn !== fieldNo) {
                    throw new Error("invalid end group tag");
                  }
                  break;
                }
                this.skip(wt, fn);
              }
              break;
            default:
              throw new Error("cant skip wire type " + wireType);
          }
          this.assertBounds();
          return this.buf.subarray(start, this.pos);
        }
        /**
         * Throws error if position in byte array is out of range.
         */
        assertBounds() {
          if (this.pos > this.len)
            throw new RangeError("premature EOF");
        }
        /**
         * Read a `int32` field, a signed 32 bit varint.
         */
        int32() {
          return this.uint32() | 0;
        }
        /**
         * Read a `sint32` field, a signed, zigzag-encoded 32-bit varint.
         */
        sint32() {
          let zze = this.uint32();
          return zze >>> 1 ^ -(zze & 1);
        }
        /**
         * Read a `int64` field, a signed 64-bit varint.
         */
        int64() {
          return protoInt64.dec(...this.varint64());
        }
        /**
         * Read a `uint64` field, an unsigned 64-bit varint.
         */
        uint64() {
          return protoInt64.uDec(...this.varint64());
        }
        /**
         * Read a `sint64` field, a signed, zig-zag-encoded 64-bit varint.
         */
        sint64() {
          let [lo, hi] = this.varint64();
          let s = -(lo & 1);
          lo = (lo >>> 1 | (hi & 1) << 31) ^ s;
          hi = hi >>> 1 ^ s;
          return protoInt64.dec(lo, hi);
        }
        /**
         * Read a `bool` field, a variant.
         */
        bool() {
          let [lo, hi] = this.varint64();
          return lo !== 0 || hi !== 0;
        }
        /**
         * Read a `fixed32` field, an unsigned, fixed-length 32-bit integer.
         */
        fixed32() {
          return this.view.getUint32((this.pos += 4) - 4, true);
        }
        /**
         * Read a `sfixed32` field, a signed, fixed-length 32-bit integer.
         */
        sfixed32() {
          return this.view.getInt32((this.pos += 4) - 4, true);
        }
        /**
         * Read a `fixed64` field, an unsigned, fixed-length 64 bit integer.
         */
        fixed64() {
          return protoInt64.uDec(this.sfixed32(), this.sfixed32());
        }
        /**
         * Read a `fixed64` field, a signed, fixed-length 64-bit integer.
         */
        sfixed64() {
          return protoInt64.dec(this.sfixed32(), this.sfixed32());
        }
        /**
         * Read a `float` field, 32-bit floating point number.
         */
        float() {
          return this.view.getFloat32((this.pos += 4) - 4, true);
        }
        /**
         * Read a `double` field, a 64-bit floating point number.
         */
        double() {
          return this.view.getFloat64((this.pos += 8) - 8, true);
        }
        /**
         * Read a `bytes` field, length-delimited arbitrary data.
         */
        bytes() {
          let len = this.uint32(), start = this.pos;
          this.pos += len;
          this.assertBounds();
          return this.buf.subarray(start, start + len);
        }
        /**
         * Read a `string` field, length-delimited data converted to UTF-8 text.
         */
        string() {
          return this.decodeUtf8(this.bytes());
        }
      };
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/reflect/reflect-check.js
  function checkField(field, value) {
    const check = field.fieldKind == "list" ? isReflectList(value, field) : field.fieldKind == "map" ? isReflectMap(value, field) : checkSingular(field, value);
    if (check === true) {
      return void 0;
    }
    let reason;
    switch (field.fieldKind) {
      case "list":
        reason = `expected ${formatReflectList(field)}, got ${formatVal(value)}`;
        break;
      case "map":
        reason = `expected ${formatReflectMap(field)}, got ${formatVal(value)}`;
        break;
      default: {
        reason = reasonSingular(field, value, check);
      }
    }
    return new FieldError(field, reason);
  }
  function checkListItem(field, index, value) {
    const check = checkSingular(field, value);
    if (check !== true) {
      return new FieldError(field, `list item #${index + 1}: ${reasonSingular(field, value, check)}`);
    }
    return void 0;
  }
  function checkMapEntry(field, key, value) {
    const checkKey = checkScalarValue(key, field.mapKey);
    if (checkKey !== true) {
      return new FieldError(field, `invalid map key: ${reasonSingular({ scalar: field.mapKey }, key, checkKey)}`);
    }
    const checkVal = checkSingular(field, value);
    if (checkVal !== true) {
      return new FieldError(field, `map entry ${formatVal(key)}: ${reasonSingular(field, value, checkVal)}`);
    }
    return void 0;
  }
  function checkSingular(field, value) {
    if (field.scalar !== void 0) {
      return checkScalarValue(value, field.scalar);
    }
    if (field.enum !== void 0) {
      if (field.enum.open) {
        return Number.isInteger(value);
      }
      return field.enum.values.some((v) => v.number === value);
    }
    return isReflectMessage(value, field.message);
  }
  function checkScalarValue(value, scalar) {
    switch (scalar) {
      case ScalarType.DOUBLE:
        return typeof value == "number";
      case ScalarType.FLOAT:
        if (typeof value != "number") {
          return false;
        }
        if (Number.isNaN(value) || !Number.isFinite(value)) {
          return true;
        }
        if (value > FLOAT32_MAX || value < FLOAT32_MIN) {
          return `${value.toFixed()} out of range`;
        }
        return true;
      case ScalarType.INT32:
      case ScalarType.SFIXED32:
      case ScalarType.SINT32:
        if (typeof value !== "number" || !Number.isInteger(value)) {
          return false;
        }
        if (value > INT32_MAX || value < INT32_MIN) {
          return `${value.toFixed()} out of range`;
        }
        return true;
      case ScalarType.FIXED32:
      case ScalarType.UINT32:
        if (typeof value !== "number" || !Number.isInteger(value)) {
          return false;
        }
        if (value > UINT32_MAX || value < 0) {
          return `${value.toFixed()} out of range`;
        }
        return true;
      case ScalarType.BOOL:
        return typeof value == "boolean";
      case ScalarType.STRING:
        if (typeof value != "string") {
          return false;
        }
        return getTextEncoding().checkUtf8(value) || "invalid UTF8";
      case ScalarType.BYTES:
        return value instanceof Uint8Array;
      case ScalarType.INT64:
      case ScalarType.SFIXED64:
      case ScalarType.SINT64:
        if (typeof value == "bigint" || typeof value == "number" || typeof value == "string" && value.length > 0) {
          try {
            protoInt64.parse(value);
            return true;
          } catch (_) {
            return `${value} out of range`;
          }
        }
        return false;
      case ScalarType.FIXED64:
      case ScalarType.UINT64:
        if (typeof value == "bigint" || typeof value == "number" || typeof value == "string" && value.length > 0) {
          try {
            protoInt64.uParse(value);
            return true;
          } catch (_) {
            return `${value} out of range`;
          }
        }
        return false;
    }
  }
  function reasonSingular(field, val, details) {
    details = typeof details == "string" ? `: ${details}` : `, got ${formatVal(val)}`;
    if (field.scalar !== void 0) {
      return `expected ${scalarTypeDescription(field.scalar)}` + details;
    }
    if (field.enum !== void 0) {
      return `expected ${field.enum.toString()}` + details;
    }
    return `expected ${formatReflectMessage(field.message)}` + details;
  }
  function formatVal(val) {
    switch (typeof val) {
      case "object":
        if (val === null) {
          return "null";
        }
        if (val instanceof Uint8Array) {
          return `Uint8Array(${val.length})`;
        }
        if (Array.isArray(val)) {
          return `Array(${val.length})`;
        }
        if (isReflectList(val)) {
          return formatReflectList(val.field());
        }
        if (isReflectMap(val)) {
          return formatReflectMap(val.field());
        }
        if (isReflectMessage(val)) {
          return formatReflectMessage(val.desc);
        }
        if (isMessage(val)) {
          return `message ${val.$typeName}`;
        }
        return "object";
      case "string":
        return val.length > 30 ? "string" : `"${val.split('"').join('\\"')}"`;
      case "boolean":
        return String(val);
      case "number":
        return String(val);
      case "bigint":
        return String(val) + "n";
      default:
        return typeof val;
    }
  }
  function formatReflectMessage(desc) {
    return `ReflectMessage (${desc.typeName})`;
  }
  function formatReflectList(field) {
    switch (field.listKind) {
      case "message":
        return `ReflectList (${field.message.toString()})`;
      case "enum":
        return `ReflectList (${field.enum.toString()})`;
      case "scalar":
        return `ReflectList (${ScalarType[field.scalar]})`;
    }
  }
  function formatReflectMap(field) {
    switch (field.mapKind) {
      case "message":
        return `ReflectMap (${ScalarType[field.mapKey]}, ${field.message.toString()})`;
      case "enum":
        return `ReflectMap (${ScalarType[field.mapKey]}, ${field.enum.toString()})`;
      case "scalar":
        return `ReflectMap (${ScalarType[field.mapKey]}, ${ScalarType[field.scalar]})`;
    }
  }
  function scalarTypeDescription(scalar) {
    switch (scalar) {
      case ScalarType.STRING:
        return "string";
      case ScalarType.BOOL:
        return "boolean";
      case ScalarType.INT64:
      case ScalarType.SINT64:
      case ScalarType.SFIXED64:
        return "bigint (int64)";
      case ScalarType.UINT64:
      case ScalarType.FIXED64:
        return "bigint (uint64)";
      case ScalarType.BYTES:
        return "Uint8Array";
      case ScalarType.DOUBLE:
        return "number (float64)";
      case ScalarType.FLOAT:
        return "number (float32)";
      case ScalarType.FIXED32:
      case ScalarType.UINT32:
        return "number (uint32)";
      case ScalarType.INT32:
      case ScalarType.SFIXED32:
      case ScalarType.SINT32:
        return "number (int32)";
    }
  }
  var init_reflect_check = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/reflect/reflect-check.js"() {
      init_descriptors();
      init_is_message();
      init_error();
      init_guard();
      init_binary_encoding();
      init_text_encoding();
      init_proto_int64();
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/reflect/reflect.js
  function reflect(messageDesc2, message, check = true) {
    return new ReflectMessageImpl(messageDesc2, message, check);
  }
  function assertOwn(owner, member) {
    if (member.parent.typeName !== owner.$typeName) {
      throw new FieldError(member, `cannot use ${member.toString()} with message ${owner.$typeName}`, "ForeignFieldError");
    }
  }
  function messageToLocal(field, value) {
    if (!isReflectMessage(value)) {
      return value;
    }
    if (isWrapper(value.message) && !field.oneof && field.fieldKind == "message") {
      return value.message.value;
    }
    if (value.desc.typeName == "google.protobuf.Struct" && field.parent.typeName != "google.protobuf.Value") {
      return wktStructToLocal(value.message);
    }
    return value.message;
  }
  function messageToReflect(field, value, check) {
    if (value !== void 0) {
      if (isWrapperDesc(field.message) && !field.oneof && field.fieldKind == "message") {
        value = {
          $typeName: field.message.typeName,
          value: longToReflect(field.message.fields[0], value)
        };
      } else if (field.message.typeName == "google.protobuf.Struct" && field.parent.typeName != "google.protobuf.Value" && isObject(value)) {
        value = wktStructToReflect(value);
      }
    }
    return new ReflectMessageImpl(field.message, value, check);
  }
  function listItemToLocal(field, value) {
    if (field.listKind == "message") {
      return messageToLocal(field, value);
    }
    return longToLocal(field, value);
  }
  function listItemToReflect(field, value, check) {
    if (field.listKind == "message") {
      return messageToReflect(field, value, check);
    }
    return longToReflect(field, value);
  }
  function mapValueToLocal(field, value) {
    if (field.mapKind == "message") {
      return messageToLocal(field, value);
    }
    return longToLocal(field, value);
  }
  function mapValueToReflect(field, value, check) {
    if (field.mapKind == "message") {
      return messageToReflect(field, value, check);
    }
    return value;
  }
  function mapKeyToLocal(key) {
    return typeof key == "string" || typeof key == "number" ? key : String(key);
  }
  function mapKeyToReflect(key, type) {
    switch (type) {
      case ScalarType.STRING:
        return key;
      case ScalarType.INT32:
      case ScalarType.FIXED32:
      case ScalarType.UINT32:
      case ScalarType.SFIXED32:
      case ScalarType.SINT32: {
        const n = Number.parseInt(key);
        if (Number.isFinite(n)) {
          return n;
        }
        break;
      }
      case ScalarType.BOOL:
        switch (key) {
          case "true":
            return true;
          case "false":
            return false;
        }
        break;
      case ScalarType.UINT64:
      case ScalarType.FIXED64:
        try {
          return protoInt64.uParse(key);
        } catch (_a) {
        }
        break;
      default:
        try {
          return protoInt64.parse(key);
        } catch (_b) {
        }
        break;
    }
    return key;
  }
  function longToReflect(field, value) {
    switch (field.scalar) {
      case ScalarType.INT64:
      case ScalarType.SFIXED64:
      case ScalarType.SINT64:
        if ("longAsString" in field && field.longAsString && typeof value == "string") {
          value = protoInt64.parse(value);
        }
        break;
      case ScalarType.FIXED64:
      case ScalarType.UINT64:
        if ("longAsString" in field && field.longAsString && typeof value == "string") {
          value = protoInt64.uParse(value);
        }
        break;
    }
    return value;
  }
  function longToLocal(field, value) {
    switch (field.scalar) {
      case ScalarType.INT64:
      case ScalarType.SFIXED64:
      case ScalarType.SINT64:
        if ("longAsString" in field && field.longAsString) {
          value = String(value);
        } else if (typeof value == "string" || typeof value == "number") {
          value = protoInt64.parse(value);
        }
        break;
      case ScalarType.FIXED64:
      case ScalarType.UINT64:
        if ("longAsString" in field && field.longAsString) {
          value = String(value);
        } else if (typeof value == "string" || typeof value == "number") {
          value = protoInt64.uParse(value);
        }
        break;
    }
    return value;
  }
  function wktStructToReflect(json) {
    const struct = {
      $typeName: "google.protobuf.Struct",
      fields: {}
    };
    if (isObject(json)) {
      for (const [k, v] of Object.entries(json)) {
        struct.fields[k] = wktValueToReflect(v);
      }
    }
    return struct;
  }
  function wktStructToLocal(val) {
    const json = {};
    for (const [k, v] of Object.entries(val.fields)) {
      json[k] = wktValueToLocal(v);
    }
    return json;
  }
  function wktValueToLocal(val) {
    switch (val.kind.case) {
      case "structValue":
        return wktStructToLocal(val.kind.value);
      case "listValue":
        return val.kind.value.values.map(wktValueToLocal);
      case "nullValue":
      case void 0:
        return null;
      default:
        return val.kind.value;
    }
  }
  function wktValueToReflect(json) {
    const value = {
      $typeName: "google.protobuf.Value",
      kind: { case: void 0 }
    };
    switch (typeof json) {
      case "number":
        value.kind = { case: "numberValue", value: json };
        break;
      case "string":
        value.kind = { case: "stringValue", value: json };
        break;
      case "boolean":
        value.kind = { case: "boolValue", value: json };
        break;
      case "object":
        if (json === null) {
          const nullValue = 0;
          value.kind = { case: "nullValue", value: nullValue };
        } else if (Array.isArray(json)) {
          const listValue = {
            $typeName: "google.protobuf.ListValue",
            values: []
          };
          if (Array.isArray(json)) {
            for (const e of json) {
              listValue.values.push(wktValueToReflect(e));
            }
          }
          value.kind = {
            case: "listValue",
            value: listValue
          };
        } else {
          value.kind = {
            case: "structValue",
            value: wktStructToReflect(json)
          };
        }
        break;
    }
    return value;
  }
  var ReflectMessageImpl, ReflectListImpl, ReflectMapImpl;
  var init_reflect = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/reflect/reflect.js"() {
      init_descriptors();
      init_reflect_check();
      init_error();
      init_unsafe();
      init_create();
      init_wrappers();
      init_scalar();
      init_proto_int64();
      init_guard();
      ReflectMessageImpl = class {
        get sortedFields() {
          var _a;
          return (_a = this._sortedFields) !== null && _a !== void 0 ? _a : (
            // biome-ignore lint/suspicious/noAssignInExpressions: no
            this._sortedFields = this.desc.fields.concat().sort((a, b) => a.number - b.number)
          );
        }
        constructor(messageDesc2, message, check = true) {
          this.lists = /* @__PURE__ */ new Map();
          this.maps = /* @__PURE__ */ new Map();
          this.check = check;
          this.desc = messageDesc2;
          this.message = this[unsafeLocal] = message !== null && message !== void 0 ? message : create(messageDesc2);
          this.fields = messageDesc2.fields;
          this.oneofs = messageDesc2.oneofs;
          this.members = messageDesc2.members;
        }
        findNumber(number) {
          if (!this._fieldsByNumber) {
            this._fieldsByNumber = new Map(this.desc.fields.map((f) => [f.number, f]));
          }
          return this._fieldsByNumber.get(number);
        }
        oneofCase(oneof) {
          assertOwn(this.message, oneof);
          return unsafeOneofCase(this.message, oneof);
        }
        isSet(field) {
          assertOwn(this.message, field);
          return unsafeIsSet(this.message, field);
        }
        clear(field) {
          assertOwn(this.message, field);
          unsafeClear(this.message, field);
        }
        get(field) {
          assertOwn(this.message, field);
          const value = unsafeGet(this.message, field);
          switch (field.fieldKind) {
            case "list":
              let list = this.lists.get(field);
              if (!list || list[unsafeLocal] !== value) {
                this.lists.set(
                  field,
                  // biome-ignore lint/suspicious/noAssignInExpressions: no
                  list = new ReflectListImpl(field, value, this.check)
                );
              }
              return list;
            case "map":
              let map = this.maps.get(field);
              if (!map || map[unsafeLocal] !== value) {
                this.maps.set(
                  field,
                  // biome-ignore lint/suspicious/noAssignInExpressions: no
                  map = new ReflectMapImpl(field, value, this.check)
                );
              }
              return map;
            case "message":
              return messageToReflect(field, value, this.check);
            case "scalar":
              return value === void 0 ? scalarZeroValue(field.scalar, false) : longToReflect(field, value);
            case "enum":
              return value !== null && value !== void 0 ? value : field.enum.values[0].number;
          }
        }
        set(field, value) {
          assertOwn(this.message, field);
          if (this.check) {
            const err = checkField(field, value);
            if (err) {
              throw err;
            }
          }
          let local;
          if (field.fieldKind == "message") {
            local = messageToLocal(field, value);
          } else if (isReflectMap(value) || isReflectList(value)) {
            local = value[unsafeLocal];
          } else {
            local = longToLocal(field, value);
          }
          unsafeSet(this.message, field, local);
        }
        getUnknown() {
          return this.message.$unknown;
        }
        setUnknown(value) {
          this.message.$unknown = value;
        }
      };
      ReflectListImpl = class {
        field() {
          return this._field;
        }
        get size() {
          return this._arr.length;
        }
        constructor(field, unsafeInput, check) {
          this._field = field;
          this._arr = this[unsafeLocal] = unsafeInput;
          this.check = check;
        }
        get(index) {
          const item = this._arr[index];
          return item === void 0 ? void 0 : listItemToReflect(this._field, item, this.check);
        }
        set(index, item) {
          if (index < 0 || index >= this._arr.length) {
            throw new FieldError(this._field, `list item #${index + 1}: out of range`);
          }
          if (this.check) {
            const err = checkListItem(this._field, index, item);
            if (err) {
              throw err;
            }
          }
          this._arr[index] = listItemToLocal(this._field, item);
        }
        add(item) {
          if (this.check) {
            const err = checkListItem(this._field, this._arr.length, item);
            if (err) {
              throw err;
            }
          }
          this._arr.push(listItemToLocal(this._field, item));
          return void 0;
        }
        clear() {
          this._arr.splice(0, this._arr.length);
        }
        [Symbol.iterator]() {
          return this.values();
        }
        keys() {
          return this._arr.keys();
        }
        *values() {
          for (const item of this._arr) {
            yield listItemToReflect(this._field, item, this.check);
          }
        }
        *entries() {
          for (let i = 0; i < this._arr.length; i++) {
            yield [i, listItemToReflect(this._field, this._arr[i], this.check)];
          }
        }
      };
      ReflectMapImpl = class {
        constructor(field, unsafeInput, check = true) {
          this.obj = this[unsafeLocal] = unsafeInput !== null && unsafeInput !== void 0 ? unsafeInput : {};
          this.check = check;
          this._field = field;
        }
        field() {
          return this._field;
        }
        set(key, value) {
          if (this.check) {
            const err = checkMapEntry(this._field, key, value);
            if (err) {
              throw err;
            }
          }
          this.obj[mapKeyToLocal(key)] = mapValueToLocal(this._field, value);
          return this;
        }
        delete(key) {
          const k = mapKeyToLocal(key);
          const has = Object.prototype.hasOwnProperty.call(this.obj, k);
          if (has) {
            delete this.obj[k];
          }
          return has;
        }
        clear() {
          for (const key of Object.keys(this.obj)) {
            delete this.obj[key];
          }
        }
        get(key) {
          let val = this.obj[mapKeyToLocal(key)];
          if (val !== void 0) {
            val = mapValueToReflect(this._field, val, this.check);
          }
          return val;
        }
        has(key) {
          return Object.prototype.hasOwnProperty.call(this.obj, mapKeyToLocal(key));
        }
        *keys() {
          for (const objKey of Object.keys(this.obj)) {
            yield mapKeyToReflect(objKey, this._field.mapKey);
          }
        }
        *entries() {
          for (const objEntry of Object.entries(this.obj)) {
            yield [
              mapKeyToReflect(objEntry[0], this._field.mapKey),
              mapValueToReflect(this._field, objEntry[1], this.check)
            ];
          }
        }
        [Symbol.iterator]() {
          return this.entries();
        }
        get size() {
          return Object.keys(this.obj).length;
        }
        *values() {
          for (const val of Object.values(this.obj)) {
            yield mapValueToReflect(this._field, val, this.check);
          }
        }
        forEach(callbackfn, thisArg) {
          for (const mapEntry of this.entries()) {
            callbackfn.call(thisArg, mapEntry[1], mapEntry[0], this);
          }
        }
      };
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/clone.js
  var init_clone = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/clone.js"() {
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/wire/base64-encoding.js
  function base64Decode(base64Str) {
    const table = getDecodeTable();
    let es = base64Str.length * 3 / 4;
    if (base64Str[base64Str.length - 2] == "=")
      es -= 2;
    else if (base64Str[base64Str.length - 1] == "=")
      es -= 1;
    let bytes = new Uint8Array(es), bytePos = 0, groupPos = 0, b, p = 0;
    for (let i = 0; i < base64Str.length; i++) {
      b = table[base64Str.charCodeAt(i)];
      if (b === void 0) {
        switch (base64Str[i]) {
          case "=":
            groupPos = 0;
          case "\n":
          case "\r":
          case "	":
          case " ":
            continue;
          default:
            throw Error("invalid base64 string");
        }
      }
      switch (groupPos) {
        case 0:
          p = b;
          groupPos = 1;
          break;
        case 1:
          bytes[bytePos++] = p << 2 | (b & 48) >> 4;
          p = b;
          groupPos = 2;
          break;
        case 2:
          bytes[bytePos++] = (p & 15) << 4 | (b & 60) >> 2;
          p = b;
          groupPos = 3;
          break;
        case 3:
          bytes[bytePos++] = (p & 3) << 6 | b;
          groupPos = 0;
          break;
      }
    }
    if (groupPos == 1)
      throw Error("invalid base64 string");
    return bytes.subarray(0, bytePos);
  }
  function getEncodeTable(encoding) {
    if (!encodeTableStd) {
      encodeTableStd = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("");
      encodeTableUrl = encodeTableStd.slice(0, -2).concat("-", "_");
    }
    return encoding == "url" ? (
      // biome-ignore lint/style/noNonNullAssertion: TS fails to narrow down
      encodeTableUrl
    ) : encodeTableStd;
  }
  function getDecodeTable() {
    if (!decodeTable) {
      decodeTable = [];
      const encodeTable = getEncodeTable("std");
      for (let i = 0; i < encodeTable.length; i++)
        decodeTable[encodeTable[i].charCodeAt(0)] = i;
      decodeTable["-".charCodeAt(0)] = encodeTable.indexOf("+");
      decodeTable["_".charCodeAt(0)] = encodeTable.indexOf("/");
    }
    return decodeTable;
  }
  var encodeTableStd, encodeTableUrl, decodeTable;
  var init_base64_encoding = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/wire/base64-encoding.js"() {
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/reflect/names.js
  function protoCamelCase(snakeCase) {
    let capNext = false;
    const b = [];
    for (let i = 0; i < snakeCase.length; i++) {
      let c = snakeCase.charAt(i);
      switch (c) {
        case "_":
          capNext = true;
          break;
        case "0":
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9":
          b.push(c);
          capNext = false;
          break;
        default:
          if (capNext) {
            capNext = false;
            c = c.toUpperCase();
          }
          b.push(c);
          break;
      }
    }
    return b.join("");
  }
  function safeObjectProperty(name) {
    return reservedObjectProperties.has(name) ? name + "$" : name;
  }
  var reservedObjectProperties;
  var init_names = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/reflect/names.js"() {
      reservedObjectProperties = /* @__PURE__ */ new Set([
        // names reserved by JavaScript
        "constructor",
        "toString",
        "toJSON",
        "valueOf"
      ]);
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/restore-json-names.js
  function restoreJsonNames(message) {
    for (const f of message.field) {
      if (!unsafeIsSetExplicit(f, "jsonName")) {
        f.jsonName = protoCamelCase(f.name);
      }
    }
    message.nestedType.forEach(restoreJsonNames);
  }
  var init_restore_json_names = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/restore-json-names.js"() {
      init_names();
      init_unsafe();
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/wire/text-format.js
  function parseTextFormatEnumValue(descEnum, value) {
    const enumValue = descEnum.values.find((v) => v.name === value);
    if (!enumValue) {
      throw new Error(`cannot parse ${descEnum} default value: ${value}`);
    }
    return enumValue.number;
  }
  function parseTextFormatScalarValue(type, value) {
    switch (type) {
      case ScalarType.STRING:
        return value;
      case ScalarType.BYTES: {
        const u = unescapeBytesDefaultValue(value);
        if (u === false) {
          throw new Error(`cannot parse ${ScalarType[type]} default value: ${value}`);
        }
        return u;
      }
      case ScalarType.INT64:
      case ScalarType.SFIXED64:
      case ScalarType.SINT64:
        return protoInt64.parse(value);
      case ScalarType.UINT64:
      case ScalarType.FIXED64:
        return protoInt64.uParse(value);
      case ScalarType.DOUBLE:
      case ScalarType.FLOAT:
        switch (value) {
          case "inf":
            return Number.POSITIVE_INFINITY;
          case "-inf":
            return Number.NEGATIVE_INFINITY;
          case "nan":
            return Number.NaN;
          default:
            return parseFloat(value);
        }
      case ScalarType.BOOL:
        return value === "true";
      case ScalarType.INT32:
      case ScalarType.UINT32:
      case ScalarType.SINT32:
      case ScalarType.FIXED32:
      case ScalarType.SFIXED32:
        return parseInt(value, 10);
    }
  }
  function unescapeBytesDefaultValue(str) {
    const b = [];
    const input = {
      tail: str,
      c: "",
      next() {
        if (this.tail.length == 0) {
          return false;
        }
        this.c = this.tail[0];
        this.tail = this.tail.substring(1);
        return true;
      },
      take(n) {
        if (this.tail.length >= n) {
          const r = this.tail.substring(0, n);
          this.tail = this.tail.substring(n);
          return r;
        }
        return false;
      }
    };
    while (input.next()) {
      switch (input.c) {
        case "\\":
          if (input.next()) {
            switch (input.c) {
              case "\\":
                b.push(input.c.charCodeAt(0));
                break;
              case "b":
                b.push(8);
                break;
              case "f":
                b.push(12);
                break;
              case "n":
                b.push(10);
                break;
              case "r":
                b.push(13);
                break;
              case "t":
                b.push(9);
                break;
              case "v":
                b.push(11);
                break;
              case "0":
              case "1":
              case "2":
              case "3":
              case "4":
              case "5":
              case "6":
              case "7": {
                const s = input.c;
                const t = input.take(2);
                if (t === false) {
                  return false;
                }
                const n = parseInt(s + t, 8);
                if (Number.isNaN(n)) {
                  return false;
                }
                b.push(n);
                break;
              }
              case "x": {
                const s = input.c;
                const t = input.take(2);
                if (t === false) {
                  return false;
                }
                const n = parseInt(s + t, 16);
                if (Number.isNaN(n)) {
                  return false;
                }
                b.push(n);
                break;
              }
              case "u": {
                const s = input.c;
                const t = input.take(4);
                if (t === false) {
                  return false;
                }
                const n = parseInt(s + t, 16);
                if (Number.isNaN(n)) {
                  return false;
                }
                const chunk = new Uint8Array(4);
                const view = new DataView(chunk.buffer);
                view.setInt32(0, n, true);
                b.push(chunk[0], chunk[1], chunk[2], chunk[3]);
                break;
              }
              case "U": {
                const s = input.c;
                const t = input.take(8);
                if (t === false) {
                  return false;
                }
                const tc = protoInt64.uEnc(s + t);
                const chunk = new Uint8Array(8);
                const view = new DataView(chunk.buffer);
                view.setInt32(0, tc.lo, true);
                view.setInt32(4, tc.hi, true);
                b.push(chunk[0], chunk[1], chunk[2], chunk[3], chunk[4], chunk[5], chunk[6], chunk[7]);
                break;
              }
            }
          }
          break;
        default:
          b.push(input.c.charCodeAt(0));
      }
    }
    return new Uint8Array(b);
  }
  var init_text_format = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/wire/text-format.js"() {
      init_descriptors();
      init_proto_int64();
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/reflect/nested-types.js
  function* nestedTypes(desc) {
    switch (desc.kind) {
      case "file":
        for (const message of desc.messages) {
          yield message;
          yield* nestedTypes(message);
        }
        yield* desc.enums;
        yield* desc.services;
        yield* desc.extensions;
        break;
      case "message":
        for (const message of desc.nestedMessages) {
          yield message;
          yield* nestedTypes(message);
        }
        yield* desc.nestedEnums;
        yield* desc.nestedExtensions;
        break;
    }
  }
  var init_nested_types = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/reflect/nested-types.js"() {
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/registry.js
  function createFileRegistry(...args) {
    const registry = createBaseRegistry();
    if (!args.length) {
      return registry;
    }
    if ("$typeName" in args[0] && args[0].$typeName == "google.protobuf.FileDescriptorSet") {
      for (const file of args[0].file) {
        addFile(file, registry);
      }
      return registry;
    }
    if ("$typeName" in args[0]) {
      let recurseDeps = function(file) {
        const deps = [];
        for (const protoFileName of file.dependency) {
          if (registry.getFile(protoFileName) != void 0) {
            continue;
          }
          if (seen.has(protoFileName)) {
            continue;
          }
          const dep = resolve(protoFileName);
          if (!dep) {
            throw new Error(`Unable to resolve ${protoFileName}, imported by ${file.name}`);
          }
          if ("kind" in dep) {
            registry.addFile(dep, false, true);
          } else {
            seen.add(dep.name);
            deps.push(dep);
          }
        }
        return deps.concat(...deps.map(recurseDeps));
      };
      const input = args[0];
      const resolve = args[1];
      const seen = /* @__PURE__ */ new Set();
      for (const file of [input, ...recurseDeps(input)].reverse()) {
        addFile(file, registry);
      }
    } else {
      for (const fileReg of args) {
        for (const file of fileReg.files) {
          registry.addFile(file);
        }
      }
    }
    return registry;
  }
  function createBaseRegistry() {
    const types = /* @__PURE__ */ new Map();
    const extendees = /* @__PURE__ */ new Map();
    const files = /* @__PURE__ */ new Map();
    return {
      kind: "registry",
      types,
      extendees,
      [Symbol.iterator]() {
        return types.values();
      },
      get files() {
        return files.values();
      },
      addFile(file, skipTypes, withDeps) {
        files.set(file.proto.name, file);
        if (!skipTypes) {
          for (const type of nestedTypes(file)) {
            this.add(type);
          }
        }
        if (withDeps) {
          for (const f of file.dependencies) {
            this.addFile(f, skipTypes, withDeps);
          }
        }
      },
      add(desc) {
        if (desc.kind == "extension") {
          let numberToExt = extendees.get(desc.extendee.typeName);
          if (!numberToExt) {
            extendees.set(
              desc.extendee.typeName,
              // biome-ignore lint/suspicious/noAssignInExpressions: no
              numberToExt = /* @__PURE__ */ new Map()
            );
          }
          numberToExt.set(desc.number, desc);
        }
        types.set(desc.typeName, desc);
      },
      get(typeName) {
        return types.get(typeName);
      },
      getFile(fileName) {
        return files.get(fileName);
      },
      getMessage(typeName) {
        const t = types.get(typeName);
        return (t === null || t === void 0 ? void 0 : t.kind) == "message" ? t : void 0;
      },
      getEnum(typeName) {
        const t = types.get(typeName);
        return (t === null || t === void 0 ? void 0 : t.kind) == "enum" ? t : void 0;
      },
      getExtension(typeName) {
        const t = types.get(typeName);
        return (t === null || t === void 0 ? void 0 : t.kind) == "extension" ? t : void 0;
      },
      getExtensionFor(extendee, no) {
        var _a;
        return (_a = extendees.get(extendee.typeName)) === null || _a === void 0 ? void 0 : _a.get(no);
      },
      getService(typeName) {
        const t = types.get(typeName);
        return (t === null || t === void 0 ? void 0 : t.kind) == "service" ? t : void 0;
      }
    };
  }
  function addFile(proto, reg) {
    var _a, _b;
    const file = {
      kind: "file",
      proto,
      deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
      edition: getFileEdition(proto),
      name: proto.name.replace(/\.proto$/, ""),
      dependencies: findFileDependencies(proto, reg),
      enums: [],
      messages: [],
      extensions: [],
      services: [],
      toString() {
        return `file ${proto.name}`;
      }
    };
    const mapEntriesStore = /* @__PURE__ */ new Map();
    const mapEntries = {
      get(typeName) {
        return mapEntriesStore.get(typeName);
      },
      add(desc) {
        var _a2;
        assert(((_a2 = desc.proto.options) === null || _a2 === void 0 ? void 0 : _a2.mapEntry) === true);
        mapEntriesStore.set(desc.typeName, desc);
      }
    };
    for (const enumProto of proto.enumType) {
      addEnum(enumProto, file, void 0, reg);
    }
    for (const messageProto of proto.messageType) {
      addMessage(messageProto, file, void 0, reg, mapEntries);
    }
    for (const serviceProto of proto.service) {
      addService(serviceProto, file, reg);
    }
    addExtensions(file, reg);
    for (const mapEntry of mapEntriesStore.values()) {
      addFields(mapEntry, reg, mapEntries);
    }
    for (const message of file.messages) {
      addFields(message, reg, mapEntries);
      addExtensions(message, reg);
    }
    reg.addFile(file, true);
  }
  function addExtensions(desc, reg) {
    switch (desc.kind) {
      case "file":
        for (const proto of desc.proto.extension) {
          const ext = newField(proto, desc, reg);
          desc.extensions.push(ext);
          reg.add(ext);
        }
        break;
      case "message":
        for (const proto of desc.proto.extension) {
          const ext = newField(proto, desc, reg);
          desc.nestedExtensions.push(ext);
          reg.add(ext);
        }
        for (const message of desc.nestedMessages) {
          addExtensions(message, reg);
        }
        break;
    }
  }
  function addFields(message, reg, mapEntries) {
    const allOneofs = message.proto.oneofDecl.map((proto) => newOneof(proto, message));
    const oneofsSeen = /* @__PURE__ */ new Set();
    for (const proto of message.proto.field) {
      const oneof = findOneof(proto, allOneofs);
      const field = newField(proto, message, reg, oneof, mapEntries);
      message.fields.push(field);
      message.field[field.localName] = field;
      if (oneof === void 0) {
        message.members.push(field);
      } else {
        oneof.fields.push(field);
        if (!oneofsSeen.has(oneof)) {
          oneofsSeen.add(oneof);
          message.members.push(oneof);
        }
      }
    }
    for (const oneof of allOneofs.filter((o) => oneofsSeen.has(o))) {
      message.oneofs.push(oneof);
    }
    for (const child of message.nestedMessages) {
      addFields(child, reg, mapEntries);
    }
  }
  function addEnum(proto, file, parent, reg) {
    var _a, _b, _c, _d, _e;
    const sharedPrefix = findEnumSharedPrefix(proto.name, proto.value);
    const desc = {
      kind: "enum",
      proto,
      deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
      file,
      parent,
      open: true,
      name: proto.name,
      typeName: makeTypeName(proto, parent, file),
      value: {},
      values: [],
      sharedPrefix,
      toString() {
        return `enum ${this.typeName}`;
      }
    };
    desc.open = isEnumOpen(desc);
    reg.add(desc);
    for (const p of proto.value) {
      const name = p.name;
      desc.values.push(
        // biome-ignore lint/suspicious/noAssignInExpressions: no
        desc.value[p.number] = {
          kind: "enum_value",
          proto: p,
          deprecated: (_d = (_c = p.options) === null || _c === void 0 ? void 0 : _c.deprecated) !== null && _d !== void 0 ? _d : false,
          parent: desc,
          name,
          localName: safeObjectProperty(sharedPrefix == void 0 ? name : name.substring(sharedPrefix.length)),
          number: p.number,
          toString() {
            return `enum value ${desc.typeName}.${name}`;
          }
        }
      );
    }
    ((_e = parent === null || parent === void 0 ? void 0 : parent.nestedEnums) !== null && _e !== void 0 ? _e : file.enums).push(desc);
  }
  function addMessage(proto, file, parent, reg, mapEntries) {
    var _a, _b, _c, _d;
    const desc = {
      kind: "message",
      proto,
      deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
      file,
      parent,
      name: proto.name,
      typeName: makeTypeName(proto, parent, file),
      fields: [],
      field: {},
      oneofs: [],
      members: [],
      nestedEnums: [],
      nestedMessages: [],
      nestedExtensions: [],
      toString() {
        return `message ${this.typeName}`;
      }
    };
    if (((_c = proto.options) === null || _c === void 0 ? void 0 : _c.mapEntry) === true) {
      mapEntries.add(desc);
    } else {
      ((_d = parent === null || parent === void 0 ? void 0 : parent.nestedMessages) !== null && _d !== void 0 ? _d : file.messages).push(desc);
      reg.add(desc);
    }
    for (const enumProto of proto.enumType) {
      addEnum(enumProto, file, desc, reg);
    }
    for (const messageProto of proto.nestedType) {
      addMessage(messageProto, file, desc, reg, mapEntries);
    }
  }
  function addService(proto, file, reg) {
    var _a, _b;
    const desc = {
      kind: "service",
      proto,
      deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
      file,
      name: proto.name,
      typeName: makeTypeName(proto, void 0, file),
      methods: [],
      method: {},
      toString() {
        return `service ${this.typeName}`;
      }
    };
    file.services.push(desc);
    reg.add(desc);
    for (const methodProto of proto.method) {
      const method = newMethod(methodProto, desc, reg);
      desc.methods.push(method);
      desc.method[method.localName] = method;
    }
  }
  function newMethod(proto, parent, reg) {
    var _a, _b, _c, _d;
    let methodKind;
    if (proto.clientStreaming && proto.serverStreaming) {
      methodKind = "bidi_streaming";
    } else if (proto.clientStreaming) {
      methodKind = "client_streaming";
    } else if (proto.serverStreaming) {
      methodKind = "server_streaming";
    } else {
      methodKind = "unary";
    }
    const input = reg.getMessage(trimLeadingDot(proto.inputType));
    const output = reg.getMessage(trimLeadingDot(proto.outputType));
    assert(input, `invalid MethodDescriptorProto: input_type ${proto.inputType} not found`);
    assert(output, `invalid MethodDescriptorProto: output_type ${proto.inputType} not found`);
    const name = proto.name;
    return {
      kind: "rpc",
      proto,
      deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
      parent,
      name,
      localName: safeObjectProperty(name.length ? safeObjectProperty(name[0].toLowerCase() + name.substring(1)) : name),
      methodKind,
      input,
      output,
      idempotency: (_d = (_c = proto.options) === null || _c === void 0 ? void 0 : _c.idempotencyLevel) !== null && _d !== void 0 ? _d : IDEMPOTENCY_UNKNOWN,
      toString() {
        return `rpc ${parent.typeName}.${name}`;
      }
    };
  }
  function newOneof(proto, parent) {
    return {
      kind: "oneof",
      proto,
      deprecated: false,
      parent,
      fields: [],
      name: proto.name,
      localName: safeObjectProperty(protoCamelCase(proto.name)),
      toString() {
        return `oneof ${parent.typeName}.${this.name}`;
      }
    };
  }
  function newField(proto, parentOrFile, reg, oneof, mapEntries) {
    var _a, _b, _c;
    const isExtension = mapEntries === void 0;
    const field = {
      kind: "field",
      proto,
      deprecated: (_b = (_a = proto.options) === null || _a === void 0 ? void 0 : _a.deprecated) !== null && _b !== void 0 ? _b : false,
      name: proto.name,
      number: proto.number,
      scalar: void 0,
      message: void 0,
      enum: void 0,
      presence: getFieldPresence(proto, oneof, isExtension, parentOrFile),
      listKind: void 0,
      mapKind: void 0,
      mapKey: void 0,
      delimitedEncoding: void 0,
      packed: void 0,
      longAsString: false,
      getDefaultValue: void 0
    };
    if (isExtension) {
      const file = parentOrFile.kind == "file" ? parentOrFile : parentOrFile.file;
      const parent = parentOrFile.kind == "file" ? void 0 : parentOrFile;
      const typeName = makeTypeName(proto, parent, file);
      field.kind = "extension";
      field.file = file;
      field.parent = parent;
      field.oneof = void 0;
      field.typeName = typeName;
      field.jsonName = `[${typeName}]`;
      field.toString = () => `extension ${typeName}`;
      const extendee = reg.getMessage(trimLeadingDot(proto.extendee));
      assert(extendee, `invalid FieldDescriptorProto: extendee ${proto.extendee} not found`);
      field.extendee = extendee;
    } else {
      const parent = parentOrFile;
      assert(parent.kind == "message");
      field.parent = parent;
      field.oneof = oneof;
      field.localName = oneof ? protoCamelCase(proto.name) : safeObjectProperty(protoCamelCase(proto.name));
      field.jsonName = proto.jsonName;
      field.toString = () => `field ${parent.typeName}.${proto.name}`;
    }
    const label = proto.label;
    const type = proto.type;
    const jstype = (_c = proto.options) === null || _c === void 0 ? void 0 : _c.jstype;
    if (label === LABEL_REPEATED) {
      const mapEntry = type == TYPE_MESSAGE ? mapEntries === null || mapEntries === void 0 ? void 0 : mapEntries.get(trimLeadingDot(proto.typeName)) : void 0;
      if (mapEntry) {
        field.fieldKind = "map";
        const { key, value } = findMapEntryFields(mapEntry);
        field.mapKey = key.scalar;
        field.mapKind = value.fieldKind;
        field.message = value.message;
        field.delimitedEncoding = false;
        field.enum = value.enum;
        field.scalar = value.scalar;
        return field;
      }
      field.fieldKind = "list";
      switch (type) {
        case TYPE_MESSAGE:
        case TYPE_GROUP:
          field.listKind = "message";
          field.message = reg.getMessage(trimLeadingDot(proto.typeName));
          assert(field.message);
          field.delimitedEncoding = isDelimitedEncoding(proto, parentOrFile);
          break;
        case TYPE_ENUM:
          field.listKind = "enum";
          field.enum = reg.getEnum(trimLeadingDot(proto.typeName));
          assert(field.enum);
          break;
        default:
          field.listKind = "scalar";
          field.scalar = type;
          field.longAsString = jstype == JS_STRING;
          break;
      }
      field.packed = isPackedField(proto, parentOrFile);
      return field;
    }
    switch (type) {
      case TYPE_MESSAGE:
      case TYPE_GROUP:
        field.fieldKind = "message";
        field.message = reg.getMessage(trimLeadingDot(proto.typeName));
        assert(field.message, `invalid FieldDescriptorProto: type_name ${proto.typeName} not found`);
        field.delimitedEncoding = isDelimitedEncoding(proto, parentOrFile);
        field.getDefaultValue = () => void 0;
        break;
      case TYPE_ENUM: {
        const enumeration = reg.getEnum(trimLeadingDot(proto.typeName));
        assert(enumeration !== void 0, `invalid FieldDescriptorProto: type_name ${proto.typeName} not found`);
        field.fieldKind = "enum";
        field.enum = reg.getEnum(trimLeadingDot(proto.typeName));
        field.getDefaultValue = () => {
          return unsafeIsSetExplicit(proto, "defaultValue") ? parseTextFormatEnumValue(enumeration, proto.defaultValue) : void 0;
        };
        break;
      }
      default: {
        field.fieldKind = "scalar";
        field.scalar = type;
        field.longAsString = jstype == JS_STRING;
        field.getDefaultValue = () => {
          return unsafeIsSetExplicit(proto, "defaultValue") ? parseTextFormatScalarValue(type, proto.defaultValue) : void 0;
        };
        break;
      }
    }
    return field;
  }
  function getFileEdition(proto) {
    switch (proto.syntax) {
      case "":
      case "proto2":
        return EDITION_PROTO22;
      case "proto3":
        return EDITION_PROTO32;
      case "editions":
        if (proto.edition in featureDefaults) {
          return proto.edition;
        }
        throw new Error(`${proto.name}: unsupported edition`);
      default:
        throw new Error(`${proto.name}: unsupported syntax "${proto.syntax}"`);
    }
  }
  function findFileDependencies(proto, reg) {
    return proto.dependency.map((wantName) => {
      const dep = reg.getFile(wantName);
      if (!dep) {
        throw new Error(`Cannot find ${wantName}, imported by ${proto.name}`);
      }
      return dep;
    });
  }
  function findEnumSharedPrefix(enumName, values) {
    const prefix = camelToSnakeCase(enumName) + "_";
    for (const value of values) {
      if (!value.name.toLowerCase().startsWith(prefix)) {
        return void 0;
      }
      const shortName = value.name.substring(prefix.length);
      if (shortName.length == 0) {
        return void 0;
      }
      if (/^\d/.test(shortName)) {
        return void 0;
      }
    }
    return prefix;
  }
  function camelToSnakeCase(camel) {
    return (camel.substring(0, 1) + camel.substring(1).replace(/[A-Z]/g, (c) => "_" + c)).toLowerCase();
  }
  function makeTypeName(proto, parent, file) {
    let typeName;
    if (parent) {
      typeName = `${parent.typeName}.${proto.name}`;
    } else if (file.proto.package.length > 0) {
      typeName = `${file.proto.package}.${proto.name}`;
    } else {
      typeName = `${proto.name}`;
    }
    return typeName;
  }
  function trimLeadingDot(typeName) {
    return typeName.startsWith(".") ? typeName.substring(1) : typeName;
  }
  function findOneof(proto, allOneofs) {
    if (!unsafeIsSetExplicit(proto, "oneofIndex")) {
      return void 0;
    }
    if (proto.proto3Optional) {
      return void 0;
    }
    const oneof = allOneofs[proto.oneofIndex];
    assert(oneof, `invalid FieldDescriptorProto: oneof #${proto.oneofIndex} for field #${proto.number} not found`);
    return oneof;
  }
  function getFieldPresence(proto, oneof, isExtension, parent) {
    if (proto.label == LABEL_REQUIRED) {
      return LEGACY_REQUIRED;
    }
    if (proto.label == LABEL_REPEATED) {
      return IMPLICIT3;
    }
    if (!!oneof || proto.proto3Optional) {
      return EXPLICIT;
    }
    if (isExtension) {
      return EXPLICIT;
    }
    const resolved = resolveFeature("fieldPresence", { proto, parent });
    if (resolved == IMPLICIT3 && (proto.type == TYPE_MESSAGE || proto.type == TYPE_GROUP)) {
      return EXPLICIT;
    }
    return resolved;
  }
  function isPackedField(proto, parent) {
    if (proto.label != LABEL_REPEATED) {
      return false;
    }
    switch (proto.type) {
      case TYPE_STRING:
      case TYPE_BYTES:
      case TYPE_GROUP:
      case TYPE_MESSAGE:
        return false;
    }
    const o = proto.options;
    if (o && unsafeIsSetExplicit(o, "packed")) {
      return o.packed;
    }
    return PACKED == resolveFeature("repeatedFieldEncoding", {
      proto,
      parent
    });
  }
  function findMapEntryFields(mapEntry) {
    const key = mapEntry.fields.find((f) => f.number === 1);
    const value = mapEntry.fields.find((f) => f.number === 2);
    assert(key && key.fieldKind == "scalar" && key.scalar != ScalarType.BYTES && key.scalar != ScalarType.FLOAT && key.scalar != ScalarType.DOUBLE && value && value.fieldKind != "list" && value.fieldKind != "map");
    return { key, value };
  }
  function isEnumOpen(desc) {
    var _a;
    return OPEN == resolveFeature("enumType", {
      proto: desc.proto,
      parent: (_a = desc.parent) !== null && _a !== void 0 ? _a : desc.file
    });
  }
  function isDelimitedEncoding(proto, parent) {
    if (proto.type == TYPE_GROUP) {
      return true;
    }
    return DELIMITED == resolveFeature("messageEncoding", {
      proto,
      parent
    });
  }
  function resolveFeature(name, ref) {
    var _a, _b;
    const featureSet = (_a = ref.proto.options) === null || _a === void 0 ? void 0 : _a.features;
    if (featureSet) {
      const val = featureSet[name];
      if (val != 0) {
        return val;
      }
    }
    if ("kind" in ref) {
      if (ref.kind == "message") {
        return resolveFeature(name, (_b = ref.parent) !== null && _b !== void 0 ? _b : ref.file);
      }
      const editionDefaults = featureDefaults[ref.edition];
      if (!editionDefaults) {
        throw new Error(`feature default for edition ${ref.edition} not found`);
      }
      return editionDefaults[name];
    }
    return resolveFeature(name, ref.parent);
  }
  function assert(condition, msg) {
    if (!condition) {
      throw new Error(msg);
    }
  }
  var EDITION_PROTO22, EDITION_PROTO32, TYPE_STRING, TYPE_GROUP, TYPE_MESSAGE, TYPE_BYTES, TYPE_ENUM, LABEL_REPEATED, LABEL_REQUIRED, JS_STRING, IDEMPOTENCY_UNKNOWN, EXPLICIT, IMPLICIT3, LEGACY_REQUIRED, PACKED, DELIMITED, OPEN, featureDefaults;
  var init_registry = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/registry.js"() {
      init_descriptors();
      init_text_format();
      init_nested_types();
      init_unsafe();
      init_names();
      EDITION_PROTO22 = 998;
      EDITION_PROTO32 = 999;
      TYPE_STRING = 9;
      TYPE_GROUP = 10;
      TYPE_MESSAGE = 11;
      TYPE_BYTES = 12;
      TYPE_ENUM = 14;
      LABEL_REPEATED = 3;
      LABEL_REQUIRED = 2;
      JS_STRING = 1;
      IDEMPOTENCY_UNKNOWN = 0;
      EXPLICIT = 1;
      IMPLICIT3 = 2;
      LEGACY_REQUIRED = 3;
      PACKED = 1;
      DELIMITED = 2;
      OPEN = 1;
      featureDefaults = {
        // EDITION_PROTO2
        998: {
          fieldPresence: 1,
          // EXPLICIT,
          enumType: 2,
          // CLOSED,
          repeatedFieldEncoding: 2,
          // EXPANDED,
          utf8Validation: 3,
          // NONE,
          messageEncoding: 1,
          // LENGTH_PREFIXED,
          jsonFormat: 2,
          // LEGACY_BEST_EFFORT,
          enforceNamingStyle: 2,
          // STYLE_LEGACY,
          defaultSymbolVisibility: 1
          // EXPORT_ALL,
        },
        // EDITION_PROTO3
        999: {
          fieldPresence: 2,
          // IMPLICIT,
          enumType: 1,
          // OPEN,
          repeatedFieldEncoding: 1,
          // PACKED,
          utf8Validation: 2,
          // VERIFY,
          messageEncoding: 1,
          // LENGTH_PREFIXED,
          jsonFormat: 1,
          // ALLOW,
          enforceNamingStyle: 2,
          // STYLE_LEGACY,
          defaultSymbolVisibility: 1
          // EXPORT_ALL,
        },
        // EDITION_2023
        1e3: {
          fieldPresence: 1,
          // EXPLICIT,
          enumType: 1,
          // OPEN,
          repeatedFieldEncoding: 1,
          // PACKED,
          utf8Validation: 2,
          // VERIFY,
          messageEncoding: 1,
          // LENGTH_PREFIXED,
          jsonFormat: 1,
          // ALLOW,
          enforceNamingStyle: 2,
          // STYLE_LEGACY,
          defaultSymbolVisibility: 1
          // EXPORT_ALL,
        },
        // EDITION_2024
        1001: {
          fieldPresence: 1,
          // EXPLICIT,
          enumType: 1,
          // OPEN,
          repeatedFieldEncoding: 1,
          // PACKED,
          utf8Validation: 2,
          // VERIFY,
          messageEncoding: 1,
          // LENGTH_PREFIXED,
          jsonFormat: 1,
          // ALLOW,
          enforceNamingStyle: 1,
          // STYLE2024,
          defaultSymbolVisibility: 2
          // EXPORT_TOP_LEVEL,
        }
      };
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/boot.js
  function boot(boot2) {
    const root = bootFileDescriptorProto(boot2);
    root.messageType.forEach(restoreJsonNames);
    const reg = createFileRegistry(root, () => void 0);
    return reg.getFile(root.name);
  }
  function bootFileDescriptorProto(init) {
    const proto = /* @__PURE__ */ Object.create({
      syntax: "",
      edition: 0
    });
    return Object.assign(proto, Object.assign(Object.assign({ $typeName: "google.protobuf.FileDescriptorProto", dependency: [], publicDependency: [], weakDependency: [], optionDependency: [], service: [], extension: [] }, init), { messageType: init.messageType.map(bootDescriptorProto), enumType: init.enumType.map(bootEnumDescriptorProto) }));
  }
  function bootDescriptorProto(init) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const proto = /* @__PURE__ */ Object.create({
      visibility: 0
    });
    return Object.assign(proto, {
      $typeName: "google.protobuf.DescriptorProto",
      name: init.name,
      field: (_b = (_a = init.field) === null || _a === void 0 ? void 0 : _a.map(bootFieldDescriptorProto)) !== null && _b !== void 0 ? _b : [],
      extension: [],
      nestedType: (_d = (_c = init.nestedType) === null || _c === void 0 ? void 0 : _c.map(bootDescriptorProto)) !== null && _d !== void 0 ? _d : [],
      enumType: (_f = (_e = init.enumType) === null || _e === void 0 ? void 0 : _e.map(bootEnumDescriptorProto)) !== null && _f !== void 0 ? _f : [],
      extensionRange: (_h = (_g = init.extensionRange) === null || _g === void 0 ? void 0 : _g.map((e) => Object.assign({ $typeName: "google.protobuf.DescriptorProto.ExtensionRange" }, e))) !== null && _h !== void 0 ? _h : [],
      oneofDecl: [],
      reservedRange: [],
      reservedName: []
    });
  }
  function bootFieldDescriptorProto(init) {
    const proto = /* @__PURE__ */ Object.create({
      label: 1,
      typeName: "",
      extendee: "",
      defaultValue: "",
      oneofIndex: 0,
      jsonName: "",
      proto3Optional: false
    });
    return Object.assign(proto, Object.assign(Object.assign({ $typeName: "google.protobuf.FieldDescriptorProto" }, init), { options: init.options ? bootFieldOptions(init.options) : void 0 }));
  }
  function bootFieldOptions(init) {
    var _a, _b, _c;
    const proto = /* @__PURE__ */ Object.create({
      ctype: 0,
      packed: false,
      jstype: 0,
      lazy: false,
      unverifiedLazy: false,
      deprecated: false,
      weak: false,
      debugRedact: false,
      retention: 0
    });
    return Object.assign(proto, Object.assign(Object.assign({ $typeName: "google.protobuf.FieldOptions" }, init), { targets: (_a = init.targets) !== null && _a !== void 0 ? _a : [], editionDefaults: (_c = (_b = init.editionDefaults) === null || _b === void 0 ? void 0 : _b.map((e) => Object.assign({ $typeName: "google.protobuf.FieldOptions.EditionDefault" }, e))) !== null && _c !== void 0 ? _c : [], uninterpretedOption: [] }));
  }
  function bootEnumDescriptorProto(init) {
    const proto = /* @__PURE__ */ Object.create({
      visibility: 0
    });
    return Object.assign(proto, {
      $typeName: "google.protobuf.EnumDescriptorProto",
      name: init.name,
      reservedName: [],
      reservedRange: [],
      value: init.value.map((e) => Object.assign({ $typeName: "google.protobuf.EnumValueDescriptorProto" }, e))
    });
  }
  var init_boot = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/boot.js"() {
      init_restore_json_names();
      init_registry();
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/message.js
  function messageDesc(file, path, ...paths) {
    return paths.reduce((acc, cur) => acc.nestedMessages[cur], file.messages[path]);
  }
  var init_message = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/message.js"() {
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/enum.js
  var init_enum = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/enum.js"() {
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/wkt/gen/google/protobuf/descriptor_pb.js
  var file_google_protobuf_descriptor, FileDescriptorProtoSchema, ExtensionRangeOptions_VerificationState, FieldDescriptorProto_Type, FieldDescriptorProto_Label, FileOptions_OptimizeMode, FieldOptions_CType, FieldOptions_JSType, FieldOptions_OptionRetention, FieldOptions_OptionTargetType, MethodOptions_IdempotencyLevel, FeatureSet_VisibilityFeature_DefaultSymbolVisibility, FeatureSet_FieldPresence, FeatureSet_EnumType, FeatureSet_RepeatedFieldEncoding, FeatureSet_Utf8Validation, FeatureSet_MessageEncoding, FeatureSet_JsonFormat, FeatureSet_EnforceNamingStyle, GeneratedCodeInfo_Annotation_Semantic, Edition, SymbolVisibility;
  var init_descriptor_pb = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/wkt/gen/google/protobuf/descriptor_pb.js"() {
      init_boot();
      init_message();
      file_google_protobuf_descriptor = /* @__PURE__ */ boot({ "name": "google/protobuf/descriptor.proto", "package": "google.protobuf", "messageType": [{ "name": "FileDescriptorSet", "field": [{ "name": "file", "number": 1, "type": 11, "label": 3, "typeName": ".google.protobuf.FileDescriptorProto" }], "extensionRange": [{ "start": 536e6, "end": 536000001 }] }, { "name": "FileDescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "package", "number": 2, "type": 9, "label": 1 }, { "name": "dependency", "number": 3, "type": 9, "label": 3 }, { "name": "public_dependency", "number": 10, "type": 5, "label": 3 }, { "name": "weak_dependency", "number": 11, "type": 5, "label": 3 }, { "name": "option_dependency", "number": 15, "type": 9, "label": 3 }, { "name": "message_type", "number": 4, "type": 11, "label": 3, "typeName": ".google.protobuf.DescriptorProto" }, { "name": "enum_type", "number": 5, "type": 11, "label": 3, "typeName": ".google.protobuf.EnumDescriptorProto" }, { "name": "service", "number": 6, "type": 11, "label": 3, "typeName": ".google.protobuf.ServiceDescriptorProto" }, { "name": "extension", "number": 7, "type": 11, "label": 3, "typeName": ".google.protobuf.FieldDescriptorProto" }, { "name": "options", "number": 8, "type": 11, "label": 1, "typeName": ".google.protobuf.FileOptions" }, { "name": "source_code_info", "number": 9, "type": 11, "label": 1, "typeName": ".google.protobuf.SourceCodeInfo" }, { "name": "syntax", "number": 12, "type": 9, "label": 1 }, { "name": "edition", "number": 14, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }] }, { "name": "DescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "field", "number": 2, "type": 11, "label": 3, "typeName": ".google.protobuf.FieldDescriptorProto" }, { "name": "extension", "number": 6, "type": 11, "label": 3, "typeName": ".google.protobuf.FieldDescriptorProto" }, { "name": "nested_type", "number": 3, "type": 11, "label": 3, "typeName": ".google.protobuf.DescriptorProto" }, { "name": "enum_type", "number": 4, "type": 11, "label": 3, "typeName": ".google.protobuf.EnumDescriptorProto" }, { "name": "extension_range", "number": 5, "type": 11, "label": 3, "typeName": ".google.protobuf.DescriptorProto.ExtensionRange" }, { "name": "oneof_decl", "number": 8, "type": 11, "label": 3, "typeName": ".google.protobuf.OneofDescriptorProto" }, { "name": "options", "number": 7, "type": 11, "label": 1, "typeName": ".google.protobuf.MessageOptions" }, { "name": "reserved_range", "number": 9, "type": 11, "label": 3, "typeName": ".google.protobuf.DescriptorProto.ReservedRange" }, { "name": "reserved_name", "number": 10, "type": 9, "label": 3 }, { "name": "visibility", "number": 11, "type": 14, "label": 1, "typeName": ".google.protobuf.SymbolVisibility" }], "nestedType": [{ "name": "ExtensionRange", "field": [{ "name": "start", "number": 1, "type": 5, "label": 1 }, { "name": "end", "number": 2, "type": 5, "label": 1 }, { "name": "options", "number": 3, "type": 11, "label": 1, "typeName": ".google.protobuf.ExtensionRangeOptions" }] }, { "name": "ReservedRange", "field": [{ "name": "start", "number": 1, "type": 5, "label": 1 }, { "name": "end", "number": 2, "type": 5, "label": 1 }] }] }, { "name": "ExtensionRangeOptions", "field": [{ "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }, { "name": "declaration", "number": 2, "type": 11, "label": 3, "typeName": ".google.protobuf.ExtensionRangeOptions.Declaration", "options": { "retention": 2 } }, { "name": "features", "number": 50, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "verification", "number": 3, "type": 14, "label": 1, "typeName": ".google.protobuf.ExtensionRangeOptions.VerificationState", "defaultValue": "UNVERIFIED", "options": { "retention": 2 } }], "nestedType": [{ "name": "Declaration", "field": [{ "name": "number", "number": 1, "type": 5, "label": 1 }, { "name": "full_name", "number": 2, "type": 9, "label": 1 }, { "name": "type", "number": 3, "type": 9, "label": 1 }, { "name": "reserved", "number": 5, "type": 8, "label": 1 }, { "name": "repeated", "number": 6, "type": 8, "label": 1 }] }], "enumType": [{ "name": "VerificationState", "value": [{ "name": "DECLARATION", "number": 0 }, { "name": "UNVERIFIED", "number": 1 }] }], "extensionRange": [{ "start": 1e3, "end": 536870912 }] }, { "name": "FieldDescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "number", "number": 3, "type": 5, "label": 1 }, { "name": "label", "number": 4, "type": 14, "label": 1, "typeName": ".google.protobuf.FieldDescriptorProto.Label" }, { "name": "type", "number": 5, "type": 14, "label": 1, "typeName": ".google.protobuf.FieldDescriptorProto.Type" }, { "name": "type_name", "number": 6, "type": 9, "label": 1 }, { "name": "extendee", "number": 2, "type": 9, "label": 1 }, { "name": "default_value", "number": 7, "type": 9, "label": 1 }, { "name": "oneof_index", "number": 9, "type": 5, "label": 1 }, { "name": "json_name", "number": 10, "type": 9, "label": 1 }, { "name": "options", "number": 8, "type": 11, "label": 1, "typeName": ".google.protobuf.FieldOptions" }, { "name": "proto3_optional", "number": 17, "type": 8, "label": 1 }], "enumType": [{ "name": "Type", "value": [{ "name": "TYPE_DOUBLE", "number": 1 }, { "name": "TYPE_FLOAT", "number": 2 }, { "name": "TYPE_INT64", "number": 3 }, { "name": "TYPE_UINT64", "number": 4 }, { "name": "TYPE_INT32", "number": 5 }, { "name": "TYPE_FIXED64", "number": 6 }, { "name": "TYPE_FIXED32", "number": 7 }, { "name": "TYPE_BOOL", "number": 8 }, { "name": "TYPE_STRING", "number": 9 }, { "name": "TYPE_GROUP", "number": 10 }, { "name": "TYPE_MESSAGE", "number": 11 }, { "name": "TYPE_BYTES", "number": 12 }, { "name": "TYPE_UINT32", "number": 13 }, { "name": "TYPE_ENUM", "number": 14 }, { "name": "TYPE_SFIXED32", "number": 15 }, { "name": "TYPE_SFIXED64", "number": 16 }, { "name": "TYPE_SINT32", "number": 17 }, { "name": "TYPE_SINT64", "number": 18 }] }, { "name": "Label", "value": [{ "name": "LABEL_OPTIONAL", "number": 1 }, { "name": "LABEL_REPEATED", "number": 3 }, { "name": "LABEL_REQUIRED", "number": 2 }] }] }, { "name": "OneofDescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "options", "number": 2, "type": 11, "label": 1, "typeName": ".google.protobuf.OneofOptions" }] }, { "name": "EnumDescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "value", "number": 2, "type": 11, "label": 3, "typeName": ".google.protobuf.EnumValueDescriptorProto" }, { "name": "options", "number": 3, "type": 11, "label": 1, "typeName": ".google.protobuf.EnumOptions" }, { "name": "reserved_range", "number": 4, "type": 11, "label": 3, "typeName": ".google.protobuf.EnumDescriptorProto.EnumReservedRange" }, { "name": "reserved_name", "number": 5, "type": 9, "label": 3 }, { "name": "visibility", "number": 6, "type": 14, "label": 1, "typeName": ".google.protobuf.SymbolVisibility" }], "nestedType": [{ "name": "EnumReservedRange", "field": [{ "name": "start", "number": 1, "type": 5, "label": 1 }, { "name": "end", "number": 2, "type": 5, "label": 1 }] }] }, { "name": "EnumValueDescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "number", "number": 2, "type": 5, "label": 1 }, { "name": "options", "number": 3, "type": 11, "label": 1, "typeName": ".google.protobuf.EnumValueOptions" }] }, { "name": "ServiceDescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "method", "number": 2, "type": 11, "label": 3, "typeName": ".google.protobuf.MethodDescriptorProto" }, { "name": "options", "number": 3, "type": 11, "label": 1, "typeName": ".google.protobuf.ServiceOptions" }] }, { "name": "MethodDescriptorProto", "field": [{ "name": "name", "number": 1, "type": 9, "label": 1 }, { "name": "input_type", "number": 2, "type": 9, "label": 1 }, { "name": "output_type", "number": 3, "type": 9, "label": 1 }, { "name": "options", "number": 4, "type": 11, "label": 1, "typeName": ".google.protobuf.MethodOptions" }, { "name": "client_streaming", "number": 5, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "server_streaming", "number": 6, "type": 8, "label": 1, "defaultValue": "false" }] }, { "name": "FileOptions", "field": [{ "name": "java_package", "number": 1, "type": 9, "label": 1 }, { "name": "java_outer_classname", "number": 8, "type": 9, "label": 1 }, { "name": "java_multiple_files", "number": 10, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "java_generate_equals_and_hash", "number": 20, "type": 8, "label": 1, "options": { "deprecated": true } }, { "name": "java_string_check_utf8", "number": 27, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "optimize_for", "number": 9, "type": 14, "label": 1, "typeName": ".google.protobuf.FileOptions.OptimizeMode", "defaultValue": "SPEED" }, { "name": "go_package", "number": 11, "type": 9, "label": 1 }, { "name": "cc_generic_services", "number": 16, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "java_generic_services", "number": 17, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "py_generic_services", "number": 18, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "deprecated", "number": 23, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "cc_enable_arenas", "number": 31, "type": 8, "label": 1, "defaultValue": "true" }, { "name": "objc_class_prefix", "number": 36, "type": 9, "label": 1 }, { "name": "csharp_namespace", "number": 37, "type": 9, "label": 1 }, { "name": "swift_prefix", "number": 39, "type": 9, "label": 1 }, { "name": "php_class_prefix", "number": 40, "type": 9, "label": 1 }, { "name": "php_namespace", "number": 41, "type": 9, "label": 1 }, { "name": "php_metadata_namespace", "number": 44, "type": 9, "label": 1 }, { "name": "ruby_package", "number": 45, "type": 9, "label": 1 }, { "name": "features", "number": 50, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "enumType": [{ "name": "OptimizeMode", "value": [{ "name": "SPEED", "number": 1 }, { "name": "CODE_SIZE", "number": 2 }, { "name": "LITE_RUNTIME", "number": 3 }] }], "extensionRange": [{ "start": 1e3, "end": 536870912 }] }, { "name": "MessageOptions", "field": [{ "name": "message_set_wire_format", "number": 1, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "no_standard_descriptor_accessor", "number": 2, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "deprecated", "number": 3, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "map_entry", "number": 7, "type": 8, "label": 1 }, { "name": "deprecated_legacy_json_field_conflicts", "number": 11, "type": 8, "label": 1, "options": { "deprecated": true } }, { "name": "features", "number": 12, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "extensionRange": [{ "start": 1e3, "end": 536870912 }] }, { "name": "FieldOptions", "field": [{ "name": "ctype", "number": 1, "type": 14, "label": 1, "typeName": ".google.protobuf.FieldOptions.CType", "defaultValue": "STRING" }, { "name": "packed", "number": 2, "type": 8, "label": 1 }, { "name": "jstype", "number": 6, "type": 14, "label": 1, "typeName": ".google.protobuf.FieldOptions.JSType", "defaultValue": "JS_NORMAL" }, { "name": "lazy", "number": 5, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "unverified_lazy", "number": 15, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "deprecated", "number": 3, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "weak", "number": 10, "type": 8, "label": 1, "defaultValue": "false", "options": { "deprecated": true } }, { "name": "debug_redact", "number": 16, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "retention", "number": 17, "type": 14, "label": 1, "typeName": ".google.protobuf.FieldOptions.OptionRetention" }, { "name": "targets", "number": 19, "type": 14, "label": 3, "typeName": ".google.protobuf.FieldOptions.OptionTargetType" }, { "name": "edition_defaults", "number": 20, "type": 11, "label": 3, "typeName": ".google.protobuf.FieldOptions.EditionDefault" }, { "name": "features", "number": 21, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "feature_support", "number": 22, "type": 11, "label": 1, "typeName": ".google.protobuf.FieldOptions.FeatureSupport" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "nestedType": [{ "name": "EditionDefault", "field": [{ "name": "edition", "number": 3, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }, { "name": "value", "number": 2, "type": 9, "label": 1 }] }, { "name": "FeatureSupport", "field": [{ "name": "edition_introduced", "number": 1, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }, { "name": "edition_deprecated", "number": 2, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }, { "name": "deprecation_warning", "number": 3, "type": 9, "label": 1 }, { "name": "edition_removed", "number": 4, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }] }], "enumType": [{ "name": "CType", "value": [{ "name": "STRING", "number": 0 }, { "name": "CORD", "number": 1 }, { "name": "STRING_PIECE", "number": 2 }] }, { "name": "JSType", "value": [{ "name": "JS_NORMAL", "number": 0 }, { "name": "JS_STRING", "number": 1 }, { "name": "JS_NUMBER", "number": 2 }] }, { "name": "OptionRetention", "value": [{ "name": "RETENTION_UNKNOWN", "number": 0 }, { "name": "RETENTION_RUNTIME", "number": 1 }, { "name": "RETENTION_SOURCE", "number": 2 }] }, { "name": "OptionTargetType", "value": [{ "name": "TARGET_TYPE_UNKNOWN", "number": 0 }, { "name": "TARGET_TYPE_FILE", "number": 1 }, { "name": "TARGET_TYPE_EXTENSION_RANGE", "number": 2 }, { "name": "TARGET_TYPE_MESSAGE", "number": 3 }, { "name": "TARGET_TYPE_FIELD", "number": 4 }, { "name": "TARGET_TYPE_ONEOF", "number": 5 }, { "name": "TARGET_TYPE_ENUM", "number": 6 }, { "name": "TARGET_TYPE_ENUM_ENTRY", "number": 7 }, { "name": "TARGET_TYPE_SERVICE", "number": 8 }, { "name": "TARGET_TYPE_METHOD", "number": 9 }] }], "extensionRange": [{ "start": 1e3, "end": 536870912 }] }, { "name": "OneofOptions", "field": [{ "name": "features", "number": 1, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "extensionRange": [{ "start": 1e3, "end": 536870912 }] }, { "name": "EnumOptions", "field": [{ "name": "allow_alias", "number": 2, "type": 8, "label": 1 }, { "name": "deprecated", "number": 3, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "deprecated_legacy_json_field_conflicts", "number": 6, "type": 8, "label": 1, "options": { "deprecated": true } }, { "name": "features", "number": 7, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "extensionRange": [{ "start": 1e3, "end": 536870912 }] }, { "name": "EnumValueOptions", "field": [{ "name": "deprecated", "number": 1, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "features", "number": 2, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "debug_redact", "number": 3, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "feature_support", "number": 4, "type": 11, "label": 1, "typeName": ".google.protobuf.FieldOptions.FeatureSupport" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "extensionRange": [{ "start": 1e3, "end": 536870912 }] }, { "name": "ServiceOptions", "field": [{ "name": "features", "number": 34, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "deprecated", "number": 33, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "extensionRange": [{ "start": 1e3, "end": 536870912 }] }, { "name": "MethodOptions", "field": [{ "name": "deprecated", "number": 33, "type": 8, "label": 1, "defaultValue": "false" }, { "name": "idempotency_level", "number": 34, "type": 14, "label": 1, "typeName": ".google.protobuf.MethodOptions.IdempotencyLevel", "defaultValue": "IDEMPOTENCY_UNKNOWN" }, { "name": "features", "number": 35, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "uninterpreted_option", "number": 999, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption" }], "enumType": [{ "name": "IdempotencyLevel", "value": [{ "name": "IDEMPOTENCY_UNKNOWN", "number": 0 }, { "name": "NO_SIDE_EFFECTS", "number": 1 }, { "name": "IDEMPOTENT", "number": 2 }] }], "extensionRange": [{ "start": 1e3, "end": 536870912 }] }, { "name": "UninterpretedOption", "field": [{ "name": "name", "number": 2, "type": 11, "label": 3, "typeName": ".google.protobuf.UninterpretedOption.NamePart" }, { "name": "identifier_value", "number": 3, "type": 9, "label": 1 }, { "name": "positive_int_value", "number": 4, "type": 4, "label": 1 }, { "name": "negative_int_value", "number": 5, "type": 3, "label": 1 }, { "name": "double_value", "number": 6, "type": 1, "label": 1 }, { "name": "string_value", "number": 7, "type": 12, "label": 1 }, { "name": "aggregate_value", "number": 8, "type": 9, "label": 1 }], "nestedType": [{ "name": "NamePart", "field": [{ "name": "name_part", "number": 1, "type": 9, "label": 2 }, { "name": "is_extension", "number": 2, "type": 8, "label": 2 }] }] }, { "name": "FeatureSet", "field": [{ "name": "field_presence", "number": 1, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.FieldPresence", "options": { "retention": 1, "targets": [4, 1], "editionDefaults": [{ "value": "EXPLICIT", "edition": 900 }, { "value": "IMPLICIT", "edition": 999 }, { "value": "EXPLICIT", "edition": 1e3 }] } }, { "name": "enum_type", "number": 2, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.EnumType", "options": { "retention": 1, "targets": [6, 1], "editionDefaults": [{ "value": "CLOSED", "edition": 900 }, { "value": "OPEN", "edition": 999 }] } }, { "name": "repeated_field_encoding", "number": 3, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.RepeatedFieldEncoding", "options": { "retention": 1, "targets": [4, 1], "editionDefaults": [{ "value": "EXPANDED", "edition": 900 }, { "value": "PACKED", "edition": 999 }] } }, { "name": "utf8_validation", "number": 4, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.Utf8Validation", "options": { "retention": 1, "targets": [4, 1], "editionDefaults": [{ "value": "NONE", "edition": 900 }, { "value": "VERIFY", "edition": 999 }] } }, { "name": "message_encoding", "number": 5, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.MessageEncoding", "options": { "retention": 1, "targets": [4, 1], "editionDefaults": [{ "value": "LENGTH_PREFIXED", "edition": 900 }] } }, { "name": "json_format", "number": 6, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.JsonFormat", "options": { "retention": 1, "targets": [3, 6, 1], "editionDefaults": [{ "value": "LEGACY_BEST_EFFORT", "edition": 900 }, { "value": "ALLOW", "edition": 999 }] } }, { "name": "enforce_naming_style", "number": 7, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.EnforceNamingStyle", "options": { "retention": 2, "targets": [1, 2, 3, 4, 5, 6, 7, 8, 9], "editionDefaults": [{ "value": "STYLE_LEGACY", "edition": 900 }, { "value": "STYLE2024", "edition": 1001 }] } }, { "name": "default_symbol_visibility", "number": 8, "type": 14, "label": 1, "typeName": ".google.protobuf.FeatureSet.VisibilityFeature.DefaultSymbolVisibility", "options": { "retention": 2, "targets": [1], "editionDefaults": [{ "value": "EXPORT_ALL", "edition": 900 }, { "value": "EXPORT_TOP_LEVEL", "edition": 1001 }] } }], "nestedType": [{ "name": "VisibilityFeature", "enumType": [{ "name": "DefaultSymbolVisibility", "value": [{ "name": "DEFAULT_SYMBOL_VISIBILITY_UNKNOWN", "number": 0 }, { "name": "EXPORT_ALL", "number": 1 }, { "name": "EXPORT_TOP_LEVEL", "number": 2 }, { "name": "LOCAL_ALL", "number": 3 }, { "name": "STRICT", "number": 4 }] }] }], "enumType": [{ "name": "FieldPresence", "value": [{ "name": "FIELD_PRESENCE_UNKNOWN", "number": 0 }, { "name": "EXPLICIT", "number": 1 }, { "name": "IMPLICIT", "number": 2 }, { "name": "LEGACY_REQUIRED", "number": 3 }] }, { "name": "EnumType", "value": [{ "name": "ENUM_TYPE_UNKNOWN", "number": 0 }, { "name": "OPEN", "number": 1 }, { "name": "CLOSED", "number": 2 }] }, { "name": "RepeatedFieldEncoding", "value": [{ "name": "REPEATED_FIELD_ENCODING_UNKNOWN", "number": 0 }, { "name": "PACKED", "number": 1 }, { "name": "EXPANDED", "number": 2 }] }, { "name": "Utf8Validation", "value": [{ "name": "UTF8_VALIDATION_UNKNOWN", "number": 0 }, { "name": "VERIFY", "number": 2 }, { "name": "NONE", "number": 3 }] }, { "name": "MessageEncoding", "value": [{ "name": "MESSAGE_ENCODING_UNKNOWN", "number": 0 }, { "name": "LENGTH_PREFIXED", "number": 1 }, { "name": "DELIMITED", "number": 2 }] }, { "name": "JsonFormat", "value": [{ "name": "JSON_FORMAT_UNKNOWN", "number": 0 }, { "name": "ALLOW", "number": 1 }, { "name": "LEGACY_BEST_EFFORT", "number": 2 }] }, { "name": "EnforceNamingStyle", "value": [{ "name": "ENFORCE_NAMING_STYLE_UNKNOWN", "number": 0 }, { "name": "STYLE2024", "number": 1 }, { "name": "STYLE_LEGACY", "number": 2 }] }], "extensionRange": [{ "start": 1e3, "end": 9995 }, { "start": 9995, "end": 1e4 }, { "start": 1e4, "end": 10001 }] }, { "name": "FeatureSetDefaults", "field": [{ "name": "defaults", "number": 1, "type": 11, "label": 3, "typeName": ".google.protobuf.FeatureSetDefaults.FeatureSetEditionDefault" }, { "name": "minimum_edition", "number": 4, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }, { "name": "maximum_edition", "number": 5, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }], "nestedType": [{ "name": "FeatureSetEditionDefault", "field": [{ "name": "edition", "number": 3, "type": 14, "label": 1, "typeName": ".google.protobuf.Edition" }, { "name": "overridable_features", "number": 4, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }, { "name": "fixed_features", "number": 5, "type": 11, "label": 1, "typeName": ".google.protobuf.FeatureSet" }] }] }, { "name": "SourceCodeInfo", "field": [{ "name": "location", "number": 1, "type": 11, "label": 3, "typeName": ".google.protobuf.SourceCodeInfo.Location" }], "nestedType": [{ "name": "Location", "field": [{ "name": "path", "number": 1, "type": 5, "label": 3, "options": { "packed": true } }, { "name": "span", "number": 2, "type": 5, "label": 3, "options": { "packed": true } }, { "name": "leading_comments", "number": 3, "type": 9, "label": 1 }, { "name": "trailing_comments", "number": 4, "type": 9, "label": 1 }, { "name": "leading_detached_comments", "number": 6, "type": 9, "label": 3 }] }], "extensionRange": [{ "start": 536e6, "end": 536000001 }] }, { "name": "GeneratedCodeInfo", "field": [{ "name": "annotation", "number": 1, "type": 11, "label": 3, "typeName": ".google.protobuf.GeneratedCodeInfo.Annotation" }], "nestedType": [{ "name": "Annotation", "field": [{ "name": "path", "number": 1, "type": 5, "label": 3, "options": { "packed": true } }, { "name": "source_file", "number": 2, "type": 9, "label": 1 }, { "name": "begin", "number": 3, "type": 5, "label": 1 }, { "name": "end", "number": 4, "type": 5, "label": 1 }, { "name": "semantic", "number": 5, "type": 14, "label": 1, "typeName": ".google.protobuf.GeneratedCodeInfo.Annotation.Semantic" }], "enumType": [{ "name": "Semantic", "value": [{ "name": "NONE", "number": 0 }, { "name": "SET", "number": 1 }, { "name": "ALIAS", "number": 2 }] }] }] }], "enumType": [{ "name": "Edition", "value": [{ "name": "EDITION_UNKNOWN", "number": 0 }, { "name": "EDITION_LEGACY", "number": 900 }, { "name": "EDITION_PROTO2", "number": 998 }, { "name": "EDITION_PROTO3", "number": 999 }, { "name": "EDITION_2023", "number": 1e3 }, { "name": "EDITION_2024", "number": 1001 }, { "name": "EDITION_1_TEST_ONLY", "number": 1 }, { "name": "EDITION_2_TEST_ONLY", "number": 2 }, { "name": "EDITION_99997_TEST_ONLY", "number": 99997 }, { "name": "EDITION_99998_TEST_ONLY", "number": 99998 }, { "name": "EDITION_99999_TEST_ONLY", "number": 99999 }, { "name": "EDITION_MAX", "number": 2147483647 }] }, { "name": "SymbolVisibility", "value": [{ "name": "VISIBILITY_UNSET", "number": 0 }, { "name": "VISIBILITY_LOCAL", "number": 1 }, { "name": "VISIBILITY_EXPORT", "number": 2 }] }] });
      FileDescriptorProtoSchema = /* @__PURE__ */ messageDesc(file_google_protobuf_descriptor, 1);
      (function(ExtensionRangeOptions_VerificationState2) {
        ExtensionRangeOptions_VerificationState2[ExtensionRangeOptions_VerificationState2["DECLARATION"] = 0] = "DECLARATION";
        ExtensionRangeOptions_VerificationState2[ExtensionRangeOptions_VerificationState2["UNVERIFIED"] = 1] = "UNVERIFIED";
      })(ExtensionRangeOptions_VerificationState || (ExtensionRangeOptions_VerificationState = {}));
      (function(FieldDescriptorProto_Type2) {
        FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["DOUBLE"] = 1] = "DOUBLE";
        FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["FLOAT"] = 2] = "FLOAT";
        FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["INT64"] = 3] = "INT64";
        FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["UINT64"] = 4] = "UINT64";
        FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["INT32"] = 5] = "INT32";
        FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["FIXED64"] = 6] = "FIXED64";
        FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["FIXED32"] = 7] = "FIXED32";
        FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["BOOL"] = 8] = "BOOL";
        FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["STRING"] = 9] = "STRING";
        FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["GROUP"] = 10] = "GROUP";
        FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["MESSAGE"] = 11] = "MESSAGE";
        FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["BYTES"] = 12] = "BYTES";
        FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["UINT32"] = 13] = "UINT32";
        FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["ENUM"] = 14] = "ENUM";
        FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["SFIXED32"] = 15] = "SFIXED32";
        FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["SFIXED64"] = 16] = "SFIXED64";
        FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["SINT32"] = 17] = "SINT32";
        FieldDescriptorProto_Type2[FieldDescriptorProto_Type2["SINT64"] = 18] = "SINT64";
      })(FieldDescriptorProto_Type || (FieldDescriptorProto_Type = {}));
      (function(FieldDescriptorProto_Label2) {
        FieldDescriptorProto_Label2[FieldDescriptorProto_Label2["OPTIONAL"] = 1] = "OPTIONAL";
        FieldDescriptorProto_Label2[FieldDescriptorProto_Label2["REPEATED"] = 3] = "REPEATED";
        FieldDescriptorProto_Label2[FieldDescriptorProto_Label2["REQUIRED"] = 2] = "REQUIRED";
      })(FieldDescriptorProto_Label || (FieldDescriptorProto_Label = {}));
      (function(FileOptions_OptimizeMode2) {
        FileOptions_OptimizeMode2[FileOptions_OptimizeMode2["SPEED"] = 1] = "SPEED";
        FileOptions_OptimizeMode2[FileOptions_OptimizeMode2["CODE_SIZE"] = 2] = "CODE_SIZE";
        FileOptions_OptimizeMode2[FileOptions_OptimizeMode2["LITE_RUNTIME"] = 3] = "LITE_RUNTIME";
      })(FileOptions_OptimizeMode || (FileOptions_OptimizeMode = {}));
      (function(FieldOptions_CType2) {
        FieldOptions_CType2[FieldOptions_CType2["STRING"] = 0] = "STRING";
        FieldOptions_CType2[FieldOptions_CType2["CORD"] = 1] = "CORD";
        FieldOptions_CType2[FieldOptions_CType2["STRING_PIECE"] = 2] = "STRING_PIECE";
      })(FieldOptions_CType || (FieldOptions_CType = {}));
      (function(FieldOptions_JSType2) {
        FieldOptions_JSType2[FieldOptions_JSType2["JS_NORMAL"] = 0] = "JS_NORMAL";
        FieldOptions_JSType2[FieldOptions_JSType2["JS_STRING"] = 1] = "JS_STRING";
        FieldOptions_JSType2[FieldOptions_JSType2["JS_NUMBER"] = 2] = "JS_NUMBER";
      })(FieldOptions_JSType || (FieldOptions_JSType = {}));
      (function(FieldOptions_OptionRetention2) {
        FieldOptions_OptionRetention2[FieldOptions_OptionRetention2["RETENTION_UNKNOWN"] = 0] = "RETENTION_UNKNOWN";
        FieldOptions_OptionRetention2[FieldOptions_OptionRetention2["RETENTION_RUNTIME"] = 1] = "RETENTION_RUNTIME";
        FieldOptions_OptionRetention2[FieldOptions_OptionRetention2["RETENTION_SOURCE"] = 2] = "RETENTION_SOURCE";
      })(FieldOptions_OptionRetention || (FieldOptions_OptionRetention = {}));
      (function(FieldOptions_OptionTargetType2) {
        FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_UNKNOWN"] = 0] = "TARGET_TYPE_UNKNOWN";
        FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_FILE"] = 1] = "TARGET_TYPE_FILE";
        FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_EXTENSION_RANGE"] = 2] = "TARGET_TYPE_EXTENSION_RANGE";
        FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_MESSAGE"] = 3] = "TARGET_TYPE_MESSAGE";
        FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_FIELD"] = 4] = "TARGET_TYPE_FIELD";
        FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_ONEOF"] = 5] = "TARGET_TYPE_ONEOF";
        FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_ENUM"] = 6] = "TARGET_TYPE_ENUM";
        FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_ENUM_ENTRY"] = 7] = "TARGET_TYPE_ENUM_ENTRY";
        FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_SERVICE"] = 8] = "TARGET_TYPE_SERVICE";
        FieldOptions_OptionTargetType2[FieldOptions_OptionTargetType2["TARGET_TYPE_METHOD"] = 9] = "TARGET_TYPE_METHOD";
      })(FieldOptions_OptionTargetType || (FieldOptions_OptionTargetType = {}));
      (function(MethodOptions_IdempotencyLevel2) {
        MethodOptions_IdempotencyLevel2[MethodOptions_IdempotencyLevel2["IDEMPOTENCY_UNKNOWN"] = 0] = "IDEMPOTENCY_UNKNOWN";
        MethodOptions_IdempotencyLevel2[MethodOptions_IdempotencyLevel2["NO_SIDE_EFFECTS"] = 1] = "NO_SIDE_EFFECTS";
        MethodOptions_IdempotencyLevel2[MethodOptions_IdempotencyLevel2["IDEMPOTENT"] = 2] = "IDEMPOTENT";
      })(MethodOptions_IdempotencyLevel || (MethodOptions_IdempotencyLevel = {}));
      (function(FeatureSet_VisibilityFeature_DefaultSymbolVisibility2) {
        FeatureSet_VisibilityFeature_DefaultSymbolVisibility2[FeatureSet_VisibilityFeature_DefaultSymbolVisibility2["DEFAULT_SYMBOL_VISIBILITY_UNKNOWN"] = 0] = "DEFAULT_SYMBOL_VISIBILITY_UNKNOWN";
        FeatureSet_VisibilityFeature_DefaultSymbolVisibility2[FeatureSet_VisibilityFeature_DefaultSymbolVisibility2["EXPORT_ALL"] = 1] = "EXPORT_ALL";
        FeatureSet_VisibilityFeature_DefaultSymbolVisibility2[FeatureSet_VisibilityFeature_DefaultSymbolVisibility2["EXPORT_TOP_LEVEL"] = 2] = "EXPORT_TOP_LEVEL";
        FeatureSet_VisibilityFeature_DefaultSymbolVisibility2[FeatureSet_VisibilityFeature_DefaultSymbolVisibility2["LOCAL_ALL"] = 3] = "LOCAL_ALL";
        FeatureSet_VisibilityFeature_DefaultSymbolVisibility2[FeatureSet_VisibilityFeature_DefaultSymbolVisibility2["STRICT"] = 4] = "STRICT";
      })(FeatureSet_VisibilityFeature_DefaultSymbolVisibility || (FeatureSet_VisibilityFeature_DefaultSymbolVisibility = {}));
      (function(FeatureSet_FieldPresence2) {
        FeatureSet_FieldPresence2[FeatureSet_FieldPresence2["FIELD_PRESENCE_UNKNOWN"] = 0] = "FIELD_PRESENCE_UNKNOWN";
        FeatureSet_FieldPresence2[FeatureSet_FieldPresence2["EXPLICIT"] = 1] = "EXPLICIT";
        FeatureSet_FieldPresence2[FeatureSet_FieldPresence2["IMPLICIT"] = 2] = "IMPLICIT";
        FeatureSet_FieldPresence2[FeatureSet_FieldPresence2["LEGACY_REQUIRED"] = 3] = "LEGACY_REQUIRED";
      })(FeatureSet_FieldPresence || (FeatureSet_FieldPresence = {}));
      (function(FeatureSet_EnumType2) {
        FeatureSet_EnumType2[FeatureSet_EnumType2["ENUM_TYPE_UNKNOWN"] = 0] = "ENUM_TYPE_UNKNOWN";
        FeatureSet_EnumType2[FeatureSet_EnumType2["OPEN"] = 1] = "OPEN";
        FeatureSet_EnumType2[FeatureSet_EnumType2["CLOSED"] = 2] = "CLOSED";
      })(FeatureSet_EnumType || (FeatureSet_EnumType = {}));
      (function(FeatureSet_RepeatedFieldEncoding2) {
        FeatureSet_RepeatedFieldEncoding2[FeatureSet_RepeatedFieldEncoding2["REPEATED_FIELD_ENCODING_UNKNOWN"] = 0] = "REPEATED_FIELD_ENCODING_UNKNOWN";
        FeatureSet_RepeatedFieldEncoding2[FeatureSet_RepeatedFieldEncoding2["PACKED"] = 1] = "PACKED";
        FeatureSet_RepeatedFieldEncoding2[FeatureSet_RepeatedFieldEncoding2["EXPANDED"] = 2] = "EXPANDED";
      })(FeatureSet_RepeatedFieldEncoding || (FeatureSet_RepeatedFieldEncoding = {}));
      (function(FeatureSet_Utf8Validation2) {
        FeatureSet_Utf8Validation2[FeatureSet_Utf8Validation2["UTF8_VALIDATION_UNKNOWN"] = 0] = "UTF8_VALIDATION_UNKNOWN";
        FeatureSet_Utf8Validation2[FeatureSet_Utf8Validation2["VERIFY"] = 2] = "VERIFY";
        FeatureSet_Utf8Validation2[FeatureSet_Utf8Validation2["NONE"] = 3] = "NONE";
      })(FeatureSet_Utf8Validation || (FeatureSet_Utf8Validation = {}));
      (function(FeatureSet_MessageEncoding2) {
        FeatureSet_MessageEncoding2[FeatureSet_MessageEncoding2["MESSAGE_ENCODING_UNKNOWN"] = 0] = "MESSAGE_ENCODING_UNKNOWN";
        FeatureSet_MessageEncoding2[FeatureSet_MessageEncoding2["LENGTH_PREFIXED"] = 1] = "LENGTH_PREFIXED";
        FeatureSet_MessageEncoding2[FeatureSet_MessageEncoding2["DELIMITED"] = 2] = "DELIMITED";
      })(FeatureSet_MessageEncoding || (FeatureSet_MessageEncoding = {}));
      (function(FeatureSet_JsonFormat2) {
        FeatureSet_JsonFormat2[FeatureSet_JsonFormat2["JSON_FORMAT_UNKNOWN"] = 0] = "JSON_FORMAT_UNKNOWN";
        FeatureSet_JsonFormat2[FeatureSet_JsonFormat2["ALLOW"] = 1] = "ALLOW";
        FeatureSet_JsonFormat2[FeatureSet_JsonFormat2["LEGACY_BEST_EFFORT"] = 2] = "LEGACY_BEST_EFFORT";
      })(FeatureSet_JsonFormat || (FeatureSet_JsonFormat = {}));
      (function(FeatureSet_EnforceNamingStyle2) {
        FeatureSet_EnforceNamingStyle2[FeatureSet_EnforceNamingStyle2["ENFORCE_NAMING_STYLE_UNKNOWN"] = 0] = "ENFORCE_NAMING_STYLE_UNKNOWN";
        FeatureSet_EnforceNamingStyle2[FeatureSet_EnforceNamingStyle2["STYLE2024"] = 1] = "STYLE2024";
        FeatureSet_EnforceNamingStyle2[FeatureSet_EnforceNamingStyle2["STYLE_LEGACY"] = 2] = "STYLE_LEGACY";
      })(FeatureSet_EnforceNamingStyle || (FeatureSet_EnforceNamingStyle = {}));
      (function(GeneratedCodeInfo_Annotation_Semantic2) {
        GeneratedCodeInfo_Annotation_Semantic2[GeneratedCodeInfo_Annotation_Semantic2["NONE"] = 0] = "NONE";
        GeneratedCodeInfo_Annotation_Semantic2[GeneratedCodeInfo_Annotation_Semantic2["SET"] = 1] = "SET";
        GeneratedCodeInfo_Annotation_Semantic2[GeneratedCodeInfo_Annotation_Semantic2["ALIAS"] = 2] = "ALIAS";
      })(GeneratedCodeInfo_Annotation_Semantic || (GeneratedCodeInfo_Annotation_Semantic = {}));
      (function(Edition2) {
        Edition2[Edition2["EDITION_UNKNOWN"] = 0] = "EDITION_UNKNOWN";
        Edition2[Edition2["EDITION_LEGACY"] = 900] = "EDITION_LEGACY";
        Edition2[Edition2["EDITION_PROTO2"] = 998] = "EDITION_PROTO2";
        Edition2[Edition2["EDITION_PROTO3"] = 999] = "EDITION_PROTO3";
        Edition2[Edition2["EDITION_2023"] = 1e3] = "EDITION_2023";
        Edition2[Edition2["EDITION_2024"] = 1001] = "EDITION_2024";
        Edition2[Edition2["EDITION_1_TEST_ONLY"] = 1] = "EDITION_1_TEST_ONLY";
        Edition2[Edition2["EDITION_2_TEST_ONLY"] = 2] = "EDITION_2_TEST_ONLY";
        Edition2[Edition2["EDITION_99997_TEST_ONLY"] = 99997] = "EDITION_99997_TEST_ONLY";
        Edition2[Edition2["EDITION_99998_TEST_ONLY"] = 99998] = "EDITION_99998_TEST_ONLY";
        Edition2[Edition2["EDITION_99999_TEST_ONLY"] = 99999] = "EDITION_99999_TEST_ONLY";
        Edition2[Edition2["EDITION_MAX"] = 2147483647] = "EDITION_MAX";
      })(Edition || (Edition = {}));
      (function(SymbolVisibility2) {
        SymbolVisibility2[SymbolVisibility2["VISIBILITY_UNSET"] = 0] = "VISIBILITY_UNSET";
        SymbolVisibility2[SymbolVisibility2["VISIBILITY_LOCAL"] = 1] = "VISIBILITY_LOCAL";
        SymbolVisibility2[SymbolVisibility2["VISIBILITY_EXPORT"] = 2] = "VISIBILITY_EXPORT";
      })(SymbolVisibility || (SymbolVisibility = {}));
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/from-binary.js
  function makeReadOptions(options) {
    return options ? Object.assign(Object.assign({}, readDefaults), options) : readDefaults;
  }
  function fromBinary(schema, bytes, options) {
    const msg = reflect(schema, void 0, false);
    readMessage(msg, new BinaryReader(bytes), makeReadOptions(options), false, bytes.byteLength);
    return msg.message;
  }
  function readMessage(message, reader, options, delimited, lengthOrDelimitedFieldNo) {
    var _a;
    const end = delimited ? reader.len : reader.pos + lengthOrDelimitedFieldNo;
    let fieldNo;
    let wireType;
    const unknownFields = (_a = message.getUnknown()) !== null && _a !== void 0 ? _a : [];
    while (reader.pos < end) {
      [fieldNo, wireType] = reader.tag();
      if (delimited && wireType == WireType.EndGroup) {
        break;
      }
      const field = message.findNumber(fieldNo);
      if (!field) {
        const data = reader.skip(wireType, fieldNo);
        if (options.readUnknownFields) {
          unknownFields.push({ no: fieldNo, wireType, data });
        }
        continue;
      }
      readField(message, reader, field, wireType, options);
    }
    if (delimited) {
      if (wireType != WireType.EndGroup || fieldNo !== lengthOrDelimitedFieldNo) {
        throw new Error("invalid end group tag");
      }
    }
    if (unknownFields.length > 0) {
      message.setUnknown(unknownFields);
    }
  }
  function readField(message, reader, field, wireType, options) {
    var _a;
    switch (field.fieldKind) {
      case "scalar":
        message.set(field, readScalar(reader, field.scalar));
        break;
      case "enum":
        const val = readScalar(reader, ScalarType.INT32);
        if (field.enum.open) {
          message.set(field, val);
        } else {
          const ok = field.enum.values.some((v) => v.number === val);
          if (ok) {
            message.set(field, val);
          } else if (options.readUnknownFields) {
            const bytes = [];
            varint32write(val, bytes);
            const unknownFields = (_a = message.getUnknown()) !== null && _a !== void 0 ? _a : [];
            unknownFields.push({
              no: field.number,
              wireType,
              data: new Uint8Array(bytes)
            });
            message.setUnknown(unknownFields);
          }
        }
        break;
      case "message":
        message.set(field, readMessageField(reader, options, field, message.get(field)));
        break;
      case "list":
        readListField(reader, wireType, message.get(field), options);
        break;
      case "map":
        readMapEntry(reader, message.get(field), options);
        break;
    }
  }
  function readMapEntry(reader, map, options) {
    const field = map.field();
    let key;
    let val;
    const len = reader.uint32();
    const end = reader.pos + len;
    while (reader.pos < end) {
      const [fieldNo] = reader.tag();
      switch (fieldNo) {
        case 1:
          key = readScalar(reader, field.mapKey);
          break;
        case 2:
          switch (field.mapKind) {
            case "scalar":
              val = readScalar(reader, field.scalar);
              break;
            case "enum":
              val = reader.int32();
              break;
            case "message":
              val = readMessageField(reader, options, field);
              break;
          }
          break;
      }
    }
    if (key === void 0) {
      key = scalarZeroValue(field.mapKey, false);
    }
    if (val === void 0) {
      switch (field.mapKind) {
        case "scalar":
          val = scalarZeroValue(field.scalar, false);
          break;
        case "enum":
          val = field.enum.values[0].number;
          break;
        case "message":
          val = reflect(field.message, void 0, false);
          break;
      }
    }
    map.set(key, val);
  }
  function readListField(reader, wireType, list, options) {
    var _a;
    const field = list.field();
    if (field.listKind === "message") {
      list.add(readMessageField(reader, options, field));
      return;
    }
    const scalarType = (_a = field.scalar) !== null && _a !== void 0 ? _a : ScalarType.INT32;
    const packed = wireType == WireType.LengthDelimited && scalarType != ScalarType.STRING && scalarType != ScalarType.BYTES;
    if (!packed) {
      list.add(readScalar(reader, scalarType));
      return;
    }
    const e = reader.uint32() + reader.pos;
    while (reader.pos < e) {
      list.add(readScalar(reader, scalarType));
    }
  }
  function readMessageField(reader, options, field, mergeMessage) {
    const delimited = field.delimitedEncoding;
    const message = mergeMessage !== null && mergeMessage !== void 0 ? mergeMessage : reflect(field.message, void 0, false);
    readMessage(message, reader, options, delimited, delimited ? field.number : reader.uint32());
    return message;
  }
  function readScalar(reader, type) {
    switch (type) {
      case ScalarType.STRING:
        return reader.string();
      case ScalarType.BOOL:
        return reader.bool();
      case ScalarType.DOUBLE:
        return reader.double();
      case ScalarType.FLOAT:
        return reader.float();
      case ScalarType.INT32:
        return reader.int32();
      case ScalarType.INT64:
        return reader.int64();
      case ScalarType.UINT64:
        return reader.uint64();
      case ScalarType.FIXED64:
        return reader.fixed64();
      case ScalarType.BYTES:
        return reader.bytes();
      case ScalarType.FIXED32:
        return reader.fixed32();
      case ScalarType.SFIXED32:
        return reader.sfixed32();
      case ScalarType.SFIXED64:
        return reader.sfixed64();
      case ScalarType.SINT64:
        return reader.sint64();
      case ScalarType.UINT32:
        return reader.uint32();
      case ScalarType.SINT32:
        return reader.sint32();
    }
  }
  var readDefaults;
  var init_from_binary = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/from-binary.js"() {
      init_descriptors();
      init_scalar();
      init_reflect();
      init_binary_encoding();
      init_varint();
      readDefaults = {
        readUnknownFields: true
      };
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/file.js
  function fileDesc(b64, imports) {
    var _a;
    const root = fromBinary(FileDescriptorProtoSchema, base64Decode(b64));
    root.messageType.forEach(restoreJsonNames);
    root.dependency = (_a = imports === null || imports === void 0 ? void 0 : imports.map((f) => f.proto.name)) !== null && _a !== void 0 ? _a : [];
    const reg = createFileRegistry(root, (protoFileName) => imports === null || imports === void 0 ? void 0 : imports.find((f) => f.proto.name === protoFileName));
    return reg.getFile(root.name);
  }
  var init_file = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/file.js"() {
      init_base64_encoding();
      init_descriptor_pb();
      init_registry();
      init_restore_json_names();
      init_from_binary();
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/to-binary.js
  function makeWriteOptions(options) {
    return options ? Object.assign(Object.assign({}, writeDefaults), options) : writeDefaults;
  }
  function toBinary(schema, message, options) {
    return writeFields(new BinaryWriter(), makeWriteOptions(options), reflect(schema, message)).finish();
  }
  function writeFields(writer, opts, msg) {
    var _a;
    for (const f of msg.sortedFields) {
      if (!msg.isSet(f)) {
        if (f.presence == LEGACY_REQUIRED2) {
          throw new Error(`cannot encode ${f} to binary: required field not set`);
        }
        continue;
      }
      writeField(writer, opts, msg, f);
    }
    if (opts.writeUnknownFields) {
      for (const { no, wireType, data } of (_a = msg.getUnknown()) !== null && _a !== void 0 ? _a : []) {
        writer.tag(no, wireType).raw(data);
      }
    }
    return writer;
  }
  function writeField(writer, opts, msg, field) {
    var _a;
    switch (field.fieldKind) {
      case "scalar":
      case "enum":
        writeScalar(writer, msg.desc.typeName, field.name, (_a = field.scalar) !== null && _a !== void 0 ? _a : ScalarType.INT32, field.number, msg.get(field));
        break;
      case "list":
        writeListField(writer, opts, field, msg.get(field));
        break;
      case "message":
        writeMessageField(writer, opts, field, msg.get(field));
        break;
      case "map":
        for (const [key, val] of msg.get(field)) {
          writeMapEntry(writer, opts, field, key, val);
        }
        break;
    }
  }
  function writeScalar(writer, msgName, fieldName, scalarType, fieldNo, value) {
    writeScalarValue(writer.tag(fieldNo, writeTypeOfScalar(scalarType)), msgName, fieldName, scalarType, value);
  }
  function writeMessageField(writer, opts, field, message) {
    if (field.delimitedEncoding) {
      writeFields(writer.tag(field.number, WireType.StartGroup), opts, message).tag(field.number, WireType.EndGroup);
    } else {
      writeFields(writer.tag(field.number, WireType.LengthDelimited).fork(), opts, message).join();
    }
  }
  function writeListField(writer, opts, field, list) {
    var _a;
    if (field.listKind == "message") {
      for (const item of list) {
        writeMessageField(writer, opts, field, item);
      }
      return;
    }
    const scalarType = (_a = field.scalar) !== null && _a !== void 0 ? _a : ScalarType.INT32;
    if (field.packed) {
      if (!list.size) {
        return;
      }
      writer.tag(field.number, WireType.LengthDelimited).fork();
      for (const item of list) {
        writeScalarValue(writer, field.parent.typeName, field.name, scalarType, item);
      }
      writer.join();
      return;
    }
    for (const item of list) {
      writeScalar(writer, field.parent.typeName, field.name, scalarType, field.number, item);
    }
  }
  function writeMapEntry(writer, opts, field, key, value) {
    var _a;
    writer.tag(field.number, WireType.LengthDelimited).fork();
    writeScalar(writer, field.parent.typeName, field.name, field.mapKey, 1, key);
    switch (field.mapKind) {
      case "scalar":
      case "enum":
        writeScalar(writer, field.parent.typeName, field.name, (_a = field.scalar) !== null && _a !== void 0 ? _a : ScalarType.INT32, 2, value);
        break;
      case "message":
        writeFields(writer.tag(2, WireType.LengthDelimited).fork(), opts, value).join();
        break;
    }
    writer.join();
  }
  function writeScalarValue(writer, msgName, fieldName, type, value) {
    try {
      switch (type) {
        case ScalarType.STRING:
          writer.string(value);
          break;
        case ScalarType.BOOL:
          writer.bool(value);
          break;
        case ScalarType.DOUBLE:
          writer.double(value);
          break;
        case ScalarType.FLOAT:
          writer.float(value);
          break;
        case ScalarType.INT32:
          writer.int32(value);
          break;
        case ScalarType.INT64:
          writer.int64(value);
          break;
        case ScalarType.UINT64:
          writer.uint64(value);
          break;
        case ScalarType.FIXED64:
          writer.fixed64(value);
          break;
        case ScalarType.BYTES:
          writer.bytes(value);
          break;
        case ScalarType.FIXED32:
          writer.fixed32(value);
          break;
        case ScalarType.SFIXED32:
          writer.sfixed32(value);
          break;
        case ScalarType.SFIXED64:
          writer.sfixed64(value);
          break;
        case ScalarType.SINT64:
          writer.sint64(value);
          break;
        case ScalarType.UINT32:
          writer.uint32(value);
          break;
        case ScalarType.SINT32:
          writer.sint32(value);
          break;
      }
    } catch (e) {
      if (e instanceof Error) {
        throw new Error(`cannot encode field ${msgName}.${fieldName} to binary: ${e.message}`);
      }
      throw e;
    }
  }
  function writeTypeOfScalar(type) {
    switch (type) {
      case ScalarType.BYTES:
      case ScalarType.STRING:
        return WireType.LengthDelimited;
      case ScalarType.DOUBLE:
      case ScalarType.FIXED64:
      case ScalarType.SFIXED64:
        return WireType.Bit64;
      case ScalarType.FIXED32:
      case ScalarType.SFIXED32:
      case ScalarType.FLOAT:
        return WireType.Bit32;
      default:
        return WireType.Varint;
    }
  }
  var LEGACY_REQUIRED2, writeDefaults;
  var init_to_binary = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/to-binary.js"() {
      init_reflect();
      init_binary_encoding();
      init_descriptors();
      LEGACY_REQUIRED2 = 3;
      writeDefaults = {
        writeUnknownFields: true
      };
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/extension.js
  var init_extension = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/extension.js"() {
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/equals.js
  var init_equals = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/equals.js"() {
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/fields.js
  var init_fields = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/fields.js"() {
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/to-json.js
  var init_to_json = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/to-json.js"() {
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/from-json.js
  var tokenIgnoredUnknownEnum, tokenNull;
  var init_from_json = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/from-json.js"() {
      tokenIgnoredUnknownEnum = Symbol();
      tokenNull = Symbol();
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/merge.js
  var init_merge = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/merge.js"() {
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/index.js
  var init_esm = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/index.js"() {
      init_types();
      init_is_message();
      init_create();
      init_clone();
      init_descriptors();
      init_equals();
      init_fields();
      init_registry();
      init_to_binary();
      init_from_binary();
      init_to_json();
      init_from_json();
      init_merge();
      init_proto_int64();
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/embed.js
  var init_embed = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/embed.js"() {
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/service.js
  var init_service = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/service.js"() {
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/symbols.js
  var packageName, wktPublicImportPaths, symbols;
  var init_symbols = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/symbols.js"() {
      packageName = "@bufbuild/protobuf";
      wktPublicImportPaths = {
        "google/protobuf/compiler/plugin.proto": packageName + "/wkt",
        "google/protobuf/any.proto": packageName + "/wkt",
        "google/protobuf/api.proto": packageName + "/wkt",
        "google/protobuf/cpp_features.proto": packageName + "/wkt",
        "google/protobuf/descriptor.proto": packageName + "/wkt",
        "google/protobuf/duration.proto": packageName + "/wkt",
        "google/protobuf/empty.proto": packageName + "/wkt",
        "google/protobuf/field_mask.proto": packageName + "/wkt",
        "google/protobuf/go_features.proto": packageName + "/wkt",
        "google/protobuf/java_features.proto": packageName + "/wkt",
        "google/protobuf/source_context.proto": packageName + "/wkt",
        "google/protobuf/struct.proto": packageName + "/wkt",
        "google/protobuf/timestamp.proto": packageName + "/wkt",
        "google/protobuf/type.proto": packageName + "/wkt",
        "google/protobuf/wrappers.proto": packageName + "/wkt"
      };
      symbols = {
        isMessage: { typeOnly: false, bootstrapWktFrom: "../../is-message.js", from: packageName },
        Message: { typeOnly: true, bootstrapWktFrom: "../../types.js", from: packageName },
        create: { typeOnly: false, bootstrapWktFrom: "../../create.js", from: packageName },
        fromJson: { typeOnly: false, bootstrapWktFrom: "../../from-json.js", from: packageName },
        fromJsonString: { typeOnly: false, bootstrapWktFrom: "../../from-json.js", from: packageName },
        fromBinary: { typeOnly: false, bootstrapWktFrom: "../../from-binary.js", from: packageName },
        toBinary: { typeOnly: false, bootstrapWktFrom: "../../to-binary.js", from: packageName },
        toJson: { typeOnly: false, bootstrapWktFrom: "../../to-json.js", from: packageName },
        toJsonString: { typeOnly: false, bootstrapWktFrom: "../../to-json.js", from: packageName },
        protoInt64: { typeOnly: false, bootstrapWktFrom: "../../proto-int64.js", from: packageName },
        JsonValue: { typeOnly: true, bootstrapWktFrom: "../../json-value.js", from: packageName },
        JsonObject: { typeOnly: true, bootstrapWktFrom: "../../json-value.js", from: packageName },
        codegen: {
          boot: { typeOnly: false, bootstrapWktFrom: "../../codegenv2/boot.js", from: packageName + "/codegenv2" },
          fileDesc: { typeOnly: false, bootstrapWktFrom: "../../codegenv2/file.js", from: packageName + "/codegenv2" },
          enumDesc: { typeOnly: false, bootstrapWktFrom: "../../codegenv2/enum.js", from: packageName + "/codegenv2" },
          extDesc: { typeOnly: false, bootstrapWktFrom: "../../codegenv2/extension.js", from: packageName + "/codegenv2" },
          messageDesc: { typeOnly: false, bootstrapWktFrom: "../../codegenv2/message.js", from: packageName + "/codegenv2" },
          serviceDesc: { typeOnly: false, bootstrapWktFrom: "../../codegenv2/service.js", from: packageName + "/codegenv2" },
          tsEnum: { typeOnly: false, bootstrapWktFrom: "../../codegenv2/enum.js", from: packageName + "/codegenv2" },
          GenFile: { typeOnly: true, bootstrapWktFrom: "../../codegenv2/types.js", from: packageName + "/codegenv2" },
          GenEnum: { typeOnly: true, bootstrapWktFrom: "../../codegenv2/types.js", from: packageName + "/codegenv2" },
          GenExtension: { typeOnly: true, bootstrapWktFrom: "../../codegenv2/types.js", from: packageName + "/codegenv2" },
          GenMessage: { typeOnly: true, bootstrapWktFrom: "../../codegenv2/types.js", from: packageName + "/codegenv2" },
          GenService: { typeOnly: true, bootstrapWktFrom: "../../codegenv2/types.js", from: packageName + "/codegenv2" }
        }
      };
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/scalar.js
  var init_scalar2 = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/scalar.js"() {
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/types.js
  var init_types2 = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/types.js"() {
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/index.js
  var init_codegenv2 = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/index.js"() {
      init_boot();
      init_embed();
      init_enum();
      init_extension();
      init_file();
      init_message();
      init_service();
      init_symbols();
      init_scalar2();
      init_types2();
    }
  });

  // web/src/proto/proto/ws_messages_pb.ts
  var file_proto_ws_messages, WsEnvelopeSchema;
  var init_ws_messages_pb = __esm({
    "web/src/proto/proto/ws_messages_pb.ts"() {
      "use strict";
      init_codegenv2();
      file_proto_ws_messages = /* @__PURE__ */ fileDesc("Chdwcm90by93c19tZXNzYWdlcy5wcm90bxIRbGlnaHRzcGVlZGR1ZWwud3MiwA0KCldzRW52ZWxvcGUSNgoMc3RhdGVfdXBkYXRlGAEgASgLMh4ubGlnaHRzcGVlZGR1ZWwud3MuU3RhdGVVcGRhdGVIABI1Cglyb29tX2Z1bGwYAiABKAsyIC5saWdodHNwZWVkZHVlbC53cy5Sb29tRnVsbEVycm9ySAASLQoEam9pbhgKIAEoCzIdLmxpZ2h0c3BlZWRkdWVsLndzLkNsaWVudEpvaW5IABIwCglzcGF3bl9ib3QYCyABKAsyGy5saWdodHNwZWVkZHVlbC53cy5TcGF3bkJvdEgAEjYKDGFkZF93YXlwb2ludBgMIAEoCzIeLmxpZ2h0c3BlZWRkdWVsLndzLkFkZFdheXBvaW50SAASPAoPdXBkYXRlX3dheXBvaW50GA0gASgLMiEubGlnaHRzcGVlZGR1ZWwud3MuVXBkYXRlV2F5cG9pbnRIABI4Cg1tb3ZlX3dheXBvaW50GA4gASgLMh8ubGlnaHRzcGVlZGR1ZWwud3MuTW92ZVdheXBvaW50SAASPAoPZGVsZXRlX3dheXBvaW50GA8gASgLMiEubGlnaHRzcGVlZGR1ZWwud3MuRGVsZXRlV2F5cG9pbnRIABI8Cg9jbGVhcl93YXlwb2ludHMYECABKAsyIS5saWdodHNwZWVkZHVlbC53cy5DbGVhcldheXBvaW50c0gAEkAKEWNvbmZpZ3VyZV9taXNzaWxlGBEgASgLMiMubGlnaHRzcGVlZGR1ZWwud3MuQ29uZmlndXJlTWlzc2lsZUgAEkUKFGFkZF9taXNzaWxlX3dheXBvaW50GBIgASgLMiUubGlnaHRzcGVlZGR1ZWwud3MuQWRkTWlzc2lsZVdheXBvaW50SAASVgoddXBkYXRlX21pc3NpbGVfd2F5cG9pbnRfc3BlZWQYEyABKAsyLS5saWdodHNwZWVkZHVlbC53cy5VcGRhdGVNaXNzaWxlV2F5cG9pbnRTcGVlZEgAEkcKFW1vdmVfbWlzc2lsZV93YXlwb2ludBgUIAEoCzImLmxpZ2h0c3BlZWRkdWVsLndzLk1vdmVNaXNzaWxlV2F5cG9pbnRIABJLChdkZWxldGVfbWlzc2lsZV93YXlwb2ludBgVIAEoCzIoLmxpZ2h0c3BlZWRkdWVsLndzLkRlbGV0ZU1pc3NpbGVXYXlwb2ludEgAEkMKE2NsZWFyX21pc3NpbGVfcm91dGUYFiABKAsyJC5saWdodHNwZWVkZHVlbC53cy5DbGVhck1pc3NpbGVSb3V0ZUgAEj8KEWFkZF9taXNzaWxlX3JvdXRlGBcgASgLMiIubGlnaHRzcGVlZGR1ZWwud3MuQWRkTWlzc2lsZVJvdXRlSAASRQoUcmVuYW1lX21pc3NpbGVfcm91dGUYGCABKAsyJS5saWdodHNwZWVkZHVlbC53cy5SZW5hbWVNaXNzaWxlUm91dGVIABJFChRkZWxldGVfbWlzc2lsZV9yb3V0ZRgZIAEoCzIlLmxpZ2h0c3BlZWRkdWVsLndzLkRlbGV0ZU1pc3NpbGVSb3V0ZUgAEkwKGHNldF9hY3RpdmVfbWlzc2lsZV9yb3V0ZRgaIAEoCzIoLmxpZ2h0c3BlZWRkdWVsLndzLlNldEFjdGl2ZU1pc3NpbGVSb3V0ZUgAEjoKDmxhdW5jaF9taXNzaWxlGBsgASgLMiAubGlnaHRzcGVlZGR1ZWwud3MuTGF1bmNoTWlzc2lsZUgAEjAKCWRhZ19zdGFydBgeIAEoCzIbLmxpZ2h0c3BlZWRkdWVsLndzLkRhZ1N0YXJ0SAASMgoKZGFnX2NhbmNlbBgfIAEoCzIcLmxpZ2h0c3BlZWRkdWVsLndzLkRhZ0NhbmNlbEgAEjcKDWRhZ19zdG9yeV9hY2sYICABKAsyHi5saWdodHNwZWVkZHVlbC53cy5EYWdTdG9yeUFja0gAEi4KCGRhZ19saXN0GCEgASgLMhoubGlnaHRzcGVlZGR1ZWwud3MuRGFnTGlzdEgAEkEKEm1pc3Npb25fc3Bhd25fd2F2ZRgoIAEoCzIjLmxpZ2h0c3BlZWRkdWVsLndzLk1pc3Npb25TcGF3bldhdmVIABJDChNtaXNzaW9uX3N0b3J5X2V2ZW50GCkgASgLMiQubGlnaHRzcGVlZGR1ZWwud3MuTWlzc2lvblN0b3J5RXZlbnRIABI/ChFkYWdfbGlzdF9yZXNwb25zZRgyIAEoCzIiLmxpZ2h0c3BlZWRkdWVsLndzLkRhZ0xpc3RSZXNwb25zZUgAQgkKB3BheWxvYWQiswUKC1N0YXRlVXBkYXRlEgsKA25vdxgBIAEoARIkCgJtZRgCIAEoCzIYLmxpZ2h0c3BlZWRkdWVsLndzLkdob3N0EigKBmdob3N0cxgDIAMoCzIYLmxpZ2h0c3BlZWRkdWVsLndzLkdob3N0EikKBG1ldGEYBCABKAsyGy5saWdodHNwZWVkZHVlbC53cy5Sb29tTWV0YRIsCghtaXNzaWxlcxgFIAMoCzIaLmxpZ2h0c3BlZWRkdWVsLndzLk1pc3NpbGUSOAoObWlzc2lsZV9jb25maWcYBiABKAsyIC5saWdodHNwZWVkZHVlbC53cy5NaXNzaWxlQ29uZmlnEjYKEW1pc3NpbGVfd2F5cG9pbnRzGAcgAygLMhsubGlnaHRzcGVlZGR1ZWwud3MuV2F5cG9pbnQSNwoObWlzc2lsZV9yb3V0ZXMYCCADKAsyHy5saWdodHNwZWVkZHVlbC53cy5NaXNzaWxlUm91dGUSHAoUYWN0aXZlX21pc3NpbGVfcm91dGUYCSABKAkSGgoSbmV4dF9taXNzaWxlX3JlYWR5GAogASgBEi0KA2RhZxgLIAEoCzIbLmxpZ2h0c3BlZWRkdWVsLndzLkRhZ1N0YXRlSACIAQESNAoJaW52ZW50b3J5GAwgASgLMhwubGlnaHRzcGVlZGR1ZWwud3MuSW52ZW50b3J5SAGIAQESMQoFc3RvcnkYDSABKAsyHS5saWdodHNwZWVkZHVlbC53cy5TdG9yeVN0YXRlSAKIAQESQAoMY2FwYWJpbGl0aWVzGA4gASgLMiUubGlnaHRzcGVlZGR1ZWwud3MuUGxheWVyQ2FwYWJpbGl0aWVzSAOIAQFCBgoEX2RhZ0IMCgpfaW52ZW50b3J5QggKBl9zdG9yeUIPCg1fY2FwYWJpbGl0aWVzIiAKDVJvb21GdWxsRXJyb3ISDwoHbWVzc2FnZRgBIAEoCSJGCgpDbGllbnRKb2luEgwKBG5hbWUYASABKAkSDAoEcm9vbRgCIAEoCRINCgVtYXBfdxgDIAEoARINCgVtYXBfaBgEIAEoASIKCghTcGF3bkJvdCIyCgtBZGRXYXlwb2ludBIJCgF4GAEgASgBEgkKAXkYAiABKAESDQoFc3BlZWQYAyABKAEiLgoOVXBkYXRlV2F5cG9pbnQSDQoFaW5kZXgYASABKAUSDQoFc3BlZWQYAiABKAEiMwoMTW92ZVdheXBv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a2VyX3NwZWVkGAQgASgBEgwKBGtfdXAYBSABKAESDgoGa19kb3duGAYgASgBEgsKA2V4cBgHIAEoASJ3Cg1VcGdyYWRlRWZmZWN0EjIKBHR5cGUYASABKA4yJC5saWdodHNwZWVkZHVlbC53cy5VcGdyYWRlRWZmZWN0VHlwZRIUCgptdWx0aXBsaWVyGAIgASgBSAASEwoJdW5sb2NrX2lkGAMgASgJSABCBwoFdmFsdWUieQoSUGxheWVyQ2FwYWJpbGl0aWVzEhgKEHNwZWVkX211bHRpcGxpZXIYASABKAESGQoRdW5sb2NrZWRfbWlzc2lsZXMYAiADKAkSFQoNaGVhdF9jYXBhY2l0eRgDIAEoARIXCg9oZWF0X2VmZmljaWVuY3kYBCABKAEi9AEKB0RhZ05vZGUSCgoCaWQYASABKAkSLAoEa2luZBgCIAEoDjIeLmxpZ2h0c3BlZWRkdWVsLndzLkRhZ05vZGVLaW5kEg0KBWxhYmVsGAMgASgJEjAKBnN0YXR1cxgEIAEoDjIgLmxpZ2h0c3BlZWRkdWVsLndzLkRhZ05vZGVTdGF0dXMSEwoLcmVtYWluaW5nX3MYBSABKAESEgoKZHVyYXRpb25fcxgGIAEoARISCgpyZXBlYXRhYmxlGAcgASgIEjEKB2VmZmVjdHMYCCADKAsyIC5saWdodHNwZWVkZHVlbC53cy5VcGdyYWRlRWZmZWN0IjUKCERhZ1N0YXRlEikKBW5vZGVzGAEgAygLMhoubGlnaHRzcGVlZGR1ZWwud3MuRGFnTm9kZSIbCghEYWdTdGFydBIPCgdub2RlX2lkGAEgASgJIhwKCURhZ0NhbmNlbBIPCgdub2RlX2lkGAEgASgJIjEKC0RhZ1N0b3J5QWNrEg8KB25vZGVfaWQYASABKAkSEQoJY2hvaWNlX2lkGAIgASgJIgkKB0RhZ0xpc3QiOwoPRGFnTGlzdFJlc3BvbnNlEigKA2RhZxgBIAEoCzIbLmxpZ2h0c3BlZWRkdWVsLndzLkRhZ1N0YXRlIloKDUludmVudG9yeUl0ZW0SDAoEdHlwZRgBIAEoCRISCgp2YXJpYW50X2lkGAIgASgJEhUKDWhlYXRfY2FwYWNpdHkYAyABKAESEAoIcXVhbnRpdHkYBCABKAUiPAoJSW52ZW50b3J5Ei8KBWl0ZW1zGAEgAygLMiAubGlnaHRzcGVlZGR1ZWwud3MuSW52ZW50b3J5SXRlbSIvChNTdG9yeURpYWxvZ3VlQ2hvaWNlEgoKAmlkGAEgASgJEgwKBHRleHQYAiABKAkiLwoQU3RvcnlUdXRvcmlhbFRpcBINCgV0aXRsZRgBIAEoCRIMCgR0ZXh0GAIgASgJIoACCg1TdG9yeURpYWxvZ3VlEg8KB3NwZWFrZXIYASABKAkSDAoEdGV4dBgCIAEoCRIuCgZpbnRlbnQYAyABKA4yHi5saWdodHNwZWVkZHVlbC53cy5TdG9yeUludGVudBIWCg5jb250aW51ZV9sYWJlbBgEIAEoCRI3CgdjaG9pY2VzGAUgAygLMiYubGlnaHRzcGVlZGR1ZWwud3MuU3RvcnlEaWFsb2d1ZUNob2ljZRI+Cgx0dXRvcmlhbF90aXAYBiABKAsyIy5saWdodHNwZWVkZHVlbC53cy5TdG9yeVR1dG9yaWFsVGlwSACIAQFCDwoNX3R1dG9yaWFsX3RpcCJECgpTdG9yeUV2ZW50EhIKCmNoYXB0ZXJfaWQYASABKAkSDwoHbm9kZV9pZBgCIAEoCRIRCgl0aW1lc3RhbXAYAyABKAEilwIKClN0b3J5U3RhdGUSEwoLYWN0aXZlX25vZGUYASABKAkSNwoIZGlhbG9ndWUYAiABKAsyIC5saWdodHNwZWVkZHVlbC53cy5TdG9yeURpYWxvZ3VlSACIAQESEQoJYXZhaWxhYmxlGAMgAygJEjcKBWZsYWdzGAQgAygLMigubGlnaHRzcGVlZGR1ZWwud3MuU3RvcnlTdGF0ZS5GbGFnc0VudHJ5EjQKDXJlY2VudF9ldmVudHMYBSADKAsyHS5saWdodHNwZWVkZHVlbC53cy5TdG9yeUV2ZW50GiwKCkZsYWdzRW50cnkSCwoDa2V5GAEgASgJEg0KBXZhbHVlGAIgASgIOgI4AUILCglfZGlhbG9ndWUiJgoQTWlzc2lvblNwYXduV2F2ZRISCgp3YXZlX2luZGV4GAEgASgFIjIKEU1pc3Npb25TdG9yeUV2ZW50Eg0KBWV2ZW50GAEgASgJEg4KBmJlYWNvbhgCIAEoBSqrAQoNRGFnTm9kZVN0YXR1cxIfChtEQUdfTk9ERV9TVEFUVVNfVU5TUEVDSUZJRUQQABIaChZEQUdfTk9ERV9TVEFUVVNfTE9DS0VEEAESHQoZREFHX05PREVfU1RBVFVTX0FWQUlMQUJMRRACEh8KG0RBR19OT0RFX1NUQVRVU19JTl9QUk9HUkVTUxADEh0KGURBR19OT0RFX1NUQVRVU19DT01QTEVURUQQBCqRAQoLRGFnTm9kZUtpbmQSHQoZREFHX05PREVfS0lORF9VTlNQRUNJRklFRBAAEhkKFURBR19OT0RFX0tJTkRfRkFDVE9SWRABEhYKEkRBR19OT0RFX0tJTkRfVU5JVBACEhcKE0RBR19OT0RFX0tJTkRfU1RPUlkQAxIXChNEQUdfTk9ERV9LSU5EX0NSQUZUEAQq2gEKEVVwZ3JhZGVFZmZlY3RUeXBlEiMKH1VQR1JBREVfRUZGRUNUX1RZUEVfVU5TUEVDSUZJRUQQABIoCiRVUEdSQURFX0VGRkVDVF9UWVBFX1NQRUVEX01VTFRJUExJRVIQARImCiJVUEdSQURFX0VGRkVDVF9UWVBFX01JU1NJTEVfVU5MT0NLEAISJQohVVBHUkFERV9FRkZFQ1RfVFlQRV9IRUFUX0NBUEFDSVRZEAMSJwojVVBHUkFERV9FRkZFQ1RfVFlQRV9IRUFUX0VGRklDSUVOQ1kQBCpcCgtTdG9yeUludGVudBIcChhTVE9SWV9JTlRFTlRfVU5TUEVDSUZJRUQQABIYChRTVE9SWV9JTlRFTlRfRkFDVE9SWRABEhUKEVNUT1JZX0lOVEVOVF9VTklUEAJCIlogTGlnaHRTcGVlZER1ZWwvaW50ZXJuYWwvcHJvdG8vd3NiBnByb3RvMw");
      WsEnvelopeSchema = /* @__PURE__ */ messageDesc(file_proto_ws_messages, 0);
    }
  });

  // web/src/proto_helpers.ts
  function protoToGhost(proto) {
    var _a;
    return {
      id: proto.id,
      x: proto.x,
      y: proto.y,
      vx: proto.vx,
      vy: proto.vy,
      t: proto.t,
      self: proto.self,
      waypoints: (_a = proto.waypoints) == null ? void 0 : _a.map((wp) => ({ x: wp.x, y: wp.y, speed: wp.speed })),
      currentWaypointIndex: proto.currentWaypointIndex,
      hp: proto.hp,
      kills: proto.kills,
      heat: proto.heat ? {
        v: proto.heat.v,
        m: proto.heat.m,
        w: proto.heat.w,
        o: proto.heat.o,
        ms: proto.heat.ms,
        su: proto.heat.su,
        ku: proto.heat.ku,
        kd: proto.heat.kd,
        ex: proto.heat.ex
      } : void 0
    };
  }
  function protoToMissile(proto) {
    return {
      id: proto.id,
      owner: proto.owner,
      self: proto.self,
      x: proto.x,
      y: proto.y,
      vx: proto.vx,
      vy: proto.vy,
      t: proto.t,
      agroRadius: proto.agroRadius,
      lifetime: proto.lifetime,
      launch: proto.launchTime,
      expires: proto.expiresAt,
      targetId: proto.targetId || void 0,
      heat: proto.heat ? {
        v: proto.heat.v,
        m: proto.heat.m,
        w: proto.heat.w,
        o: proto.heat.o,
        ms: proto.heat.ms,
        su: proto.heat.su,
        ku: proto.heat.ku,
        kd: proto.heat.kd,
        ex: proto.heat.ex
      } : void 0
    };
  }
  function protoToState(proto) {
    const base = {
      now: proto.now,
      me: proto.me ? protoToGhost(proto.me) : null,
      ghosts: proto.ghosts.map(protoToGhost),
      missiles: proto.missiles.map(protoToMissile),
      meta: proto.meta ? {
        c: proto.meta.c,
        w: proto.meta.w,
        h: proto.meta.h
      } : { c: 299, w: 16e3, h: 9e3 },
      missileConfig: proto.missileConfig ? {
        speed: proto.missileConfig.speed,
        speedMin: proto.missileConfig.speedMin,
        speedMax: proto.missileConfig.speedMax,
        agroMin: proto.missileConfig.agroMin,
        agroRadius: proto.missileConfig.agroRadius,
        lifetime: proto.missileConfig.lifetime,
        heatConfig: proto.missileConfig.heatConfig ? {
          max: proto.missileConfig.heatConfig.max,
          warnAt: proto.missileConfig.heatConfig.warnAt,
          overheatAt: proto.missileConfig.heatConfig.overheatAt,
          markerSpeed: proto.missileConfig.heatConfig.markerSpeed,
          kUp: proto.missileConfig.heatConfig.kUp,
          kDown: proto.missileConfig.heatConfig.kDown,
          exp: proto.missileConfig.heatConfig.exp
        } : void 0
      } : {
        speed: 0,
        speedMin: 0,
        speedMax: 0,
        agroMin: 0,
        agroRadius: 0,
        lifetime: 0
      },
      missileWaypoints: proto.missileWaypoints.map((wp) => ({ x: wp.x, y: wp.y, speed: wp.speed })),
      missileRoutes: proto.missileRoutes.map((r) => ({
        id: r.id,
        name: r.name,
        waypoints: r.waypoints.map((wp) => ({ x: wp.x, y: wp.y, speed: wp.speed }))
      })),
      activeMissileRoute: proto.activeMissileRoute,
      nextMissileReady: proto.nextMissileReady
    };
    return {
      ...base,
      dag: proto.dag ? protoToDagState(proto.dag) : void 0,
      inventory: proto.inventory ? protoToInventory(proto.inventory) : void 0,
      story: proto.story ? protoToStoryState(proto.story) : void 0,
      capabilities: proto.capabilities ? protoToPlayerCapabilities(proto.capabilities) : void 0
    };
  }
  function protoStatusToString(status) {
    switch (status) {
      case 1 /* LOCKED */:
        return "locked";
      case 2 /* AVAILABLE */:
        return "available";
      case 3 /* IN_PROGRESS */:
        return "in_progress";
      case 4 /* COMPLETED */:
        return "completed";
      default:
        return "unknown";
    }
  }
  function protoKindToString(kind) {
    switch (kind) {
      case 1 /* FACTORY */:
        return "factory";
      case 2 /* UNIT */:
        return "unit";
      case 3 /* STORY */:
        return "story";
      case 4 /* CRAFT */:
        return "craft";
      default:
        return "unknown";
    }
  }
  function protoIntentToString(intent) {
    switch (intent) {
      case 1 /* FACTORY */:
        return "factory";
      case 2 /* UNIT */:
        return "unit";
      default:
        return "";
    }
  }
  function protoEffectTypeToString(type) {
    const typeMap = {
      1: "speed_multiplier",
      2: "missile_unlock",
      3: "heat_capacity",
      4: "heat_efficiency"
    };
    return typeMap[type] || "unknown";
  }
  function protoToUpgradeEffect(proto) {
    return {
      type: protoEffectTypeToString(proto.type),
      value: proto.value.case === "multiplier" ? proto.value.value : proto.value.value
    };
  }
  function protoToPlayerCapabilities(proto) {
    return {
      speedMultiplier: proto.speedMultiplier,
      unlockedMissiles: proto.unlockedMissiles,
      heatCapacity: proto.heatCapacity,
      heatEfficiency: proto.heatEfficiency
    };
  }
  function protoToDagNode(proto) {
    var _a;
    return {
      id: proto.id,
      kind: protoKindToString(proto.kind),
      label: proto.label,
      status: protoStatusToString(proto.status),
      remainingS: proto.remainingS,
      durationS: proto.durationS,
      repeatable: proto.repeatable,
      effects: ((_a = proto.effects) == null ? void 0 : _a.map(protoToUpgradeEffect)) || []
    };
  }
  function protoToDagState(proto) {
    return {
      nodes: proto.nodes.map(protoToDagNode)
    };
  }
  function protoToInventoryItem(proto) {
    return {
      type: proto.type,
      variantId: proto.variantId,
      heatCapacity: proto.heatCapacity,
      quantity: proto.quantity
    };
  }
  function protoToInventory(proto) {
    return {
      items: proto.items.map(protoToInventoryItem)
    };
  }
  function protoToStoryDialogue(proto) {
    return {
      speaker: proto.speaker,
      text: proto.text,
      intent: protoIntentToString(proto.intent),
      continueLabel: proto.continueLabel,
      choices: proto.choices.map((c) => ({ id: c.id, text: c.text })),
      tutorialTip: proto.tutorialTip ? {
        title: proto.tutorialTip.title,
        text: proto.tutorialTip.text
      } : void 0
    };
  }
  function protoToStoryState(proto) {
    return {
      activeNode: proto.activeNode,
      dialogue: proto.dialogue ? protoToStoryDialogue(proto.dialogue) : void 0,
      available: proto.available,
      flags: proto.flags,
      recentEvents: proto.recentEvents.map((e) => ({
        chapterId: e.chapterId,
        nodeId: e.nodeId,
        timestamp: e.timestamp
      }))
    };
  }
  var init_proto_helpers = __esm({
    "web/src/proto_helpers.ts"() {
      "use strict";
      init_ws_messages_pb();
    }
  });

  // web/src/net.ts
  function sendProto(envelope) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const bytes = toBinary(WsEnvelopeSchema, envelope);
    ws.send(bytes);
  }
  function sendDagStart(nodeId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    sendProto(create(WsEnvelopeSchema, {
      payload: {
        case: "dagStart",
        value: { nodeId }
      }
    }));
  }
  function connectWebSocket({
    room,
    state,
    bus,
    onStateUpdated,
    onOpen,
    mapW,
    mapH,
    mode,
    missionId
  }) {
    const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
    let wsUrl = `${protocol}${window.location.host}/ws?room=${encodeURIComponent(room)}`;
    if (mapW && mapW > 0) {
      wsUrl += `&mapW=${mapW}`;
    }
    if (mapH && mapH > 0) {
      wsUrl += `&mapH=${mapH}`;
    }
    if (mode) {
      wsUrl += `&mode=${encodeURIComponent(mode)}`;
    }
    if (missionId) {
      wsUrl += `&mission=${encodeURIComponent(missionId)}`;
    }
    ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    ws.addEventListener("open", () => {
      console.log("[ws] open");
      const socket = ws;
      if (socket && onOpen) {
        onOpen(socket);
      }
    });
    ws.addEventListener("close", () => console.log("[ws] close"));
    let prevRoutes = /* @__PURE__ */ new Map();
    let prevActiveRoute = null;
    let prevMissileCount = 0;
    ws.addEventListener("message", (event) => {
      if (event.data instanceof ArrayBuffer) {
        try {
          const envelope = fromBinary(WsEnvelopeSchema, new Uint8Array(event.data));
          if (envelope.payload.case === "stateUpdate") {
            const protoState = protoToState(envelope.payload.value);
            handleProtoStateMessage(state, protoState, bus, prevRoutes, prevActiveRoute, prevMissileCount);
            prevRoutes = new Map(state.missileRoutes.map((route) => [route.id, cloneRoute(route)]));
            prevActiveRoute = state.activeMissileRouteId;
            prevMissileCount = state.missiles.length;
            bus.emit("state:updated");
            onStateUpdated == null ? void 0 : onStateUpdated();
          } else if (envelope.payload.case === "roomFull") {
            console.error("[ws] Room full:", envelope.payload.value.message);
            bus.emit("connection:error", { message: envelope.payload.value.message });
          } else if (envelope.payload.case === "dagListResponse") {
            const dagData = envelope.payload.value.dag;
            if (dagData) {
              bus.emit("dag:list", protoToDagState(dagData));
            }
          } else {
            console.warn("[ws] Unknown protobuf message type:", envelope.payload.case);
          }
        } catch (err) {
          console.error("[ws] Failed to decode protobuf message:", err);
        }
        return;
      }
    });
  }
  function handleProtoStateMessage(state, msg, bus, prevRoutes, prevActiveRoute, prevMissileCount) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t;
    state.now = msg.now;
    state.nowSyncedAt = monotonicNow();
    state.nextMissileReadyAt = msg.nextMissileReady;
    if (msg.me) {
      state.me = {
        x: msg.me.x,
        y: msg.me.y,
        vx: msg.me.vx,
        vy: msg.me.vy,
        hp: msg.me.hp,
        kills: msg.me.kills,
        waypoints: (_a = msg.me.waypoints) != null ? _a : [],
        currentWaypointIndex: (_b = msg.me.currentWaypointIndex) != null ? _b : 0,
        heat: msg.me.heat ? convertHeatView(msg.me.heat, state.nowSyncedAt, state.now) : void 0
      };
    } else {
      state.me = null;
    }
    state.ghosts = msg.ghosts;
    state.missiles = msg.missiles;
    const newRoutes = msg.missileRoutes;
    diffRoutes(prevRoutes, newRoutes, bus);
    state.missileRoutes = newRoutes;
    const nextActive = msg.activeMissileRoute || (newRoutes.length > 0 ? newRoutes[0].id : null);
    state.activeMissileRouteId = nextActive;
    if (nextActive !== prevActiveRoute) {
      bus.emit("missile:activeRouteChanged", { routeId: nextActive });
    }
    if (msg.missileConfig) {
      updateMissileLimits(state, {
        speedMin: msg.missileConfig.speedMin,
        speedMax: msg.missileConfig.speedMax,
        agroMin: msg.missileConfig.agroMin
      });
      const prevHeat = state.missileConfig.heatParams;
      let heatParams;
      if (msg.missileConfig.heatConfig) {
        const heatConfig = msg.missileConfig.heatConfig;
        heatParams = {
          max: (_d = (_c = heatConfig.max) != null ? _c : prevHeat == null ? void 0 : prevHeat.max) != null ? _d : 0,
          warnAt: (_f = (_e = heatConfig.warnAt) != null ? _e : prevHeat == null ? void 0 : prevHeat.warnAt) != null ? _f : 0,
          overheatAt: (_h = (_g = heatConfig.overheatAt) != null ? _g : prevHeat == null ? void 0 : prevHeat.overheatAt) != null ? _h : 0,
          markerSpeed: (_j = (_i = heatConfig.markerSpeed) != null ? _i : prevHeat == null ? void 0 : prevHeat.markerSpeed) != null ? _j : 0,
          kUp: (_l = (_k = heatConfig.kUp) != null ? _k : prevHeat == null ? void 0 : prevHeat.kUp) != null ? _l : 0,
          kDown: (_n = (_m = heatConfig.kDown) != null ? _m : prevHeat == null ? void 0 : prevHeat.kDown) != null ? _n : 0,
          exp: (_p = (_o = heatConfig.exp) != null ? _o : prevHeat == null ? void 0 : prevHeat.exp) != null ? _p : 1
        };
      }
      const sanitized = sanitizeMissileConfig({
        speed: msg.missileConfig.speed,
        agroRadius: msg.missileConfig.agroRadius,
        heatParams
      }, state.missileConfig, state.missileLimits);
      sanitized.lifetime = msg.missileConfig.lifetime;
      state.missileConfig = sanitized;
    }
    state.worldMeta = {
      c: msg.meta.c,
      w: msg.meta.w,
      h: msg.meta.h
    };
    if (msg.inventory) {
      state.inventory = {
        items: msg.inventory.items.map((item) => ({
          type: item.type,
          variant_id: item.variantId,
          heat_capacity: item.heatCapacity,
          quantity: item.quantity
        }))
      };
    }
    if (msg.dag) {
      state.dag = {
        nodes: msg.dag.nodes.map((node) => ({
          id: node.id,
          kind: node.kind,
          label: node.label,
          status: node.status,
          remaining_s: node.remainingS,
          duration_s: node.durationS,
          repeatable: node.repeatable,
          effects: node.effects || []
        }))
      };
    }
    if (msg.capabilities) {
      state.capabilities = {
        speedMultiplier: msg.capabilities.speedMultiplier,
        unlockedMissiles: msg.capabilities.unlockedMissiles,
        heatCapacity: msg.capabilities.heatCapacity,
        heatEfficiency: msg.capabilities.heatEfficiency
      };
    }
    if (msg.story) {
      const prevActiveNode = (_r = (_q = state.story) == null ? void 0 : _q.activeNode) != null ? _r : null;
      let dialogue = null;
      if (msg.story.dialogue) {
        const d = msg.story.dialogue;
        dialogue = {
          speaker: d.speaker,
          text: d.text,
          intent: d.intent,
          typingSpeedMs: 18,
          continueLabel: d.continueLabel,
          choices: (_s = d.choices) == null ? void 0 : _s.map((c) => ({ id: c.id, text: c.text })),
          tutorialTip: d.tutorialTip ? {
            title: d.tutorialTip.title,
            text: d.tutorialTip.text
          } : void 0
        };
      }
      state.story = {
        activeNode: msg.story.activeNode || null,
        dialogue,
        available: msg.story.available,
        flags: msg.story.flags,
        recentEvents: msg.story.recentEvents.map((evt) => ({
          chapter: evt.chapterId,
          node: evt.nodeId,
          timestamp: evt.timestamp
        }))
      };
      if (state.story.activeNode !== prevActiveNode && state.story.activeNode) {
        bus.emit("story:nodeActivated", {
          nodeId: state.story.activeNode,
          dialogue: (_t = state.story.dialogue) != null ? _t : void 0
        });
      }
    }
    const newMissileCount = state.missiles.length;
    if (newMissileCount > prevMissileCount) {
      for (let i = prevMissileCount; i < newMissileCount; i++) {
        const m = state.missiles[i];
        if (m && m.self) {
          bus.emit("missile:launched", { routeId: msg.activeMissileRoute || "" });
        }
      }
    }
    const cooldownRemaining = Math.max(0, state.nextMissileReadyAt - getApproxServerNow(state));
    bus.emit("missile:cooldownUpdated", { secondsRemaining: cooldownRemaining });
  }
  function diffRoutes(prevRoutes, nextRoutes, bus) {
    const seen = /* @__PURE__ */ new Set();
    for (const route of nextRoutes) {
      seen.add(route.id);
      const prev = prevRoutes.get(route.id);
      if (!prev) {
        bus.emit("missile:routeAdded", { routeId: route.id });
        continue;
      }
      if (route.name !== prev.name) {
        bus.emit("missile:routeRenamed", { routeId: route.id, name: route.name });
      }
      if (route.waypoints.length > prev.waypoints.length) {
        bus.emit("missile:waypointAdded", { routeId: route.id, index: route.waypoints.length - 1 });
      } else if (route.waypoints.length < prev.waypoints.length) {
        bus.emit("missile:waypointDeleted", { routeId: route.id, index: prev.waypoints.length - 1 });
      }
      if (prev.waypoints.length > 0 && route.waypoints.length === 0) {
        bus.emit("missile:waypointsCleared", { routeId: route.id });
      }
    }
    for (const [routeId] of prevRoutes) {
      if (!seen.has(routeId)) {
        bus.emit("missile:routeDeleted", { routeId });
      }
    }
  }
  function cloneRoute(route) {
    return {
      id: route.id,
      name: route.name,
      waypoints: route.waypoints.map((wp) => ({ ...wp }))
    };
  }
  function getApproxServerNow(state) {
    if (!Number.isFinite(state.now)) {
      return 0;
    }
    const syncedAt = Number.isFinite(state.nowSyncedAt) ? state.nowSyncedAt : null;
    if (!syncedAt) {
      return state.now;
    }
    const elapsedMs = monotonicNow() - syncedAt;
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
      return state.now;
    }
    return state.now + elapsedMs / 1e3;
  }
  function convertHeatView(serverHeat, nowSyncedAtMs, serverNowSec) {
    const serverStallUntilSec = serverHeat.su;
    const offsetFromNowSec = serverStallUntilSec - serverNowSec;
    const stallUntilMs = nowSyncedAtMs + offsetFromNowSec * 1e3;
    const heatView = {
      value: serverHeat.v,
      max: serverHeat.m,
      warnAt: serverHeat.w,
      overheatAt: serverHeat.o,
      markerSpeed: serverHeat.ms,
      stallUntilMs,
      kUp: serverHeat.ku,
      kDown: serverHeat.kd,
      exp: serverHeat.ex
    };
    return heatView;
  }
  var ws;
  var init_net = __esm({
    "web/src/net.ts"() {
      "use strict";
      init_state();
      init_esm();
      init_ws_messages_pb();
      init_proto_helpers();
      ws = null;
    }
  });

  // web/src/upgrades.ts
  function initUpgradesPanel(state, bus) {
    const panel = createPanelElement();
    document.body.appendChild(panel);
    const container = panel.querySelector(".tech-tree-container");
    const closeBtn = panel.querySelector(".close-btn");
    const overlay = panel.querySelector(".panel-overlay");
    function renderUpgrades() {
      var _a;
      const upgradeNodes = ((_a = state.dag) == null ? void 0 : _a.nodes.filter((n) => n.kind === "unit")) || [];
      renderTechTree(upgradeNodes, container);
    }
    function togglePanel(visible) {
      panel.classList.toggle("visible", visible);
      if (visible) {
        renderUpgrades();
      }
    }
    bus.on("upgrades:toggle", () => {
      togglePanel(!panel.classList.contains("visible"));
    });
    bus.on("upgrades:show", () => togglePanel(true));
    bus.on("upgrades:hide", () => togglePanel(false));
    closeBtn.addEventListener("click", () => togglePanel(false));
    overlay.addEventListener("click", () => togglePanel(false));
    bus.on("state:updated", () => {
      if (panel.classList.contains("visible")) {
        renderUpgrades();
      }
    });
    container.addEventListener("click", (e) => {
      var _a;
      const nodeEl = e.target.closest("[data-node-id]");
      if (!nodeEl) return;
      const nodeId = nodeEl.getAttribute("data-node-id");
      const node = (_a = state.dag) == null ? void 0 : _a.nodes.find((n) => n.id === nodeId);
      if ((node == null ? void 0 : node.status) === "available") {
        sendDagStart(nodeId);
      }
    });
  }
  function createPanelElement() {
    const panel = document.createElement("div");
    panel.className = "upgrades-panel";
    panel.innerHTML = `
    <div class="panel-overlay"></div>
    <div class="panel-content">
      <div class="panel-header">
        <h2>Ship Upgrades</h2>
        <button class="close-btn">\xD7</button>
      </div>
      <div class="tech-tree-container"></div>
    </div>
  `;
    return panel;
  }
  function renderTechTree(nodes, container) {
    container.innerHTML = `
    <div class="tech-tree">
      ${nodes.map(renderNode).join("")}
    </div>
  `;
  }
  function renderNode(node) {
    var _a;
    const statusClass = `node-${node.status}`;
    const effectsHtml = ((_a = node.effects) == null ? void 0 : _a.map((e) => {
      if (e.type === "speed_multiplier") {
        return `+${((e.value - 1) * 100).toFixed(0)}% Speed`;
      } else if (e.type === "missile_unlock") {
        return `Unlock ${e.value}`;
      } else if (e.type === "heat_capacity") {
        return `+${((e.value - 1) * 100).toFixed(0)}% Heat Capacity`;
      } else if (e.type === "heat_efficiency") {
        return `+${((e.value - 1) * 100).toFixed(0)}% Cooling`;
      }
      return "";
    }).join(", ")) || "";
    const countdownHtml = node.status === "in_progress" ? `<div class="countdown">${formatTime(node.remaining_s)}</div>` : "";
    return `
    <div class="node ${statusClass}" data-node-id="${node.id}">
      <h3>${node.label}</h3>
      ${effectsHtml ? `<p class="effects">${effectsHtml}</p>` : ""}
      <p class="duration">Duration: ${formatTime(node.duration_s)}</p>
      ${countdownHtml}
      ${node.status === "available" ? "<button>Start</button>" : ""}
      ${node.status === "completed" ? '<div class="checkmark">\u2713</div>' : ""}
    </div>
  `;
  }
  function formatTime(seconds) {
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
  }
  function startCountdownTimer(state, bus) {
    if (countdownInterval) {
      clearInterval(countdownInterval);
    }
    countdownInterval = window.setInterval(() => {
      var _a;
      const upgradeNodes = ((_a = state.dag) == null ? void 0 : _a.nodes.filter(
        (n) => n.kind === "unit" && n.status === "in_progress"
      )) || [];
      upgradeNodes.forEach((node) => {
        const el = document.querySelector(`[data-node-id="${node.id}"] .countdown`);
        if (el && node.remaining_s > 0) {
          el.textContent = formatTime(node.remaining_s);
        }
      });
      const inProgressCount = upgradeNodes.length;
      bus.emit("upgrades:countUpdated", { count: inProgressCount });
    }, 1e3);
  }
  var countdownInterval;
  var init_upgrades = __esm({
    "web/src/upgrades.ts"() {
      "use strict";
      init_net();
      countdownInterval = null;
    }
  });

  // web/src/lobby.ts
  var require_lobby = __commonJS({
    "web/src/lobby.ts"() {
      init_bus();
      init_state();
      init_upgrades();
      init_net();
      var STORAGE_KEY = "lsd:callsign";
      var saveStatusTimer = null;
      var callSignInput = document.querySelector("#call-sign-input");
      var saveStatus = document.getElementById("save-status");
      var campaignButton = document.getElementById("campaign-button");
      var tutorialButton = document.getElementById("tutorial-button");
      var freeplayButton = document.getElementById("freeplay-button");
      var mapSizeSelect = document.querySelector("#map-size-select");
      var upgradesBtn = document.getElementById("upgrades-btn");
      var bus = createEventBus();
      var state = createInitialState();
      initUpgradesPanel(state, bus);
      startCountdownTimer(state, bus);
      upgradesBtn == null ? void 0 : upgradesBtn.addEventListener("click", () => {
        bus.emit("upgrades:toggle");
      });
      bus.on("upgrades:countUpdated", ({ count }) => {
        const badge = document.getElementById("upgrades-badge");
        if (badge) {
          badge.textContent = count > 0 ? `\u2699\uFE0F ${count}` : "";
          badge.style.display = count > 0 ? "inline" : "none";
        }
      });
      var urlParams = new URLSearchParams(window.location.search);
      var lobbyRoom = urlParams.get("lobbyRoom") || "lobby-shared";
      if (typeof WebSocket !== "undefined") {
        connectWebSocket({
          room: lobbyRoom,
          state,
          bus,
          onStateUpdated: () => {
            bus.emit("state:updated");
          }
        });
      }
      bootstrap();
      function bootstrap() {
        var _a;
        const initialName = resolveInitialCallSign();
        if (callSignInput) {
          callSignInput.value = initialName;
        }
        (_a = document.getElementById("call-sign-form")) == null ? void 0 : _a.addEventListener("submit", (event) => {
          event.preventDefault();
          const name = ensureCallSign();
          if (name) {
            showSaveStatus("Saved call sign");
          } else {
            showSaveStatus("Cleared call sign");
          }
        });
        campaignButton == null ? void 0 : campaignButton.addEventListener("click", () => {
          const name = ensureCallSign();
          const roomId = generateRoomId("campaign");
          const missionId = "1";
          const url = buildRoomUrl(
            roomId,
            name,
            "campaign",
            { w: 32e3, h: 18e3 },
            missionId
          );
          window.location.href = url;
        });
        tutorialButton == null ? void 0 : tutorialButton.addEventListener("click", () => {
          const name = ensureCallSign();
          const mapSize = getSelectedMapSize();
          const roomId = generateRoomId("tutorial");
          const url = buildRoomUrl(roomId, name, "tutorial", mapSize);
          window.location.href = url;
        });
        freeplayButton == null ? void 0 : freeplayButton.addEventListener("click", () => {
          const name = ensureCallSign();
          const mapSize = getSelectedMapSize();
          const roomId = generateRoomId("freeplay");
          const url = buildRoomUrl(roomId, name, "freeplay", mapSize);
          window.location.href = url;
        });
      }
      function getSelectedMapSize() {
        const selected = (mapSizeSelect == null ? void 0 : mapSizeSelect.value) || "medium";
        switch (selected) {
          case "small":
            return { w: 4e3, h: 2250 };
          case "medium":
            return { w: 8e3, h: 4500 };
          case "large":
            return { w: 16e3, h: 9e3 };
          case "huge":
            return { w: 32e3, h: 18e3 };
          default:
            return { w: 8e3, h: 4500 };
        }
      }
      function ensureCallSign() {
        const inputName = callSignInput ? callSignInput.value : "";
        const sanitized = sanitizeCallSign(inputName);
        if (callSignInput) {
          callSignInput.value = sanitized;
        }
        persistCallSign(sanitized);
        return sanitized;
      }
      function resolveInitialCallSign() {
        const fromQuery = sanitizeCallSign(new URLSearchParams(window.location.search).get("name"));
        const stored = sanitizeCallSign(readStoredCallSign());
        if (fromQuery) {
          if (fromQuery !== stored) {
            persistCallSign(fromQuery);
          }
          return fromQuery;
        }
        return stored;
      }
      function sanitizeCallSign(value) {
        if (!value) {
          return "";
        }
        const trimmed = value.trim();
        if (!trimmed) {
          return "";
        }
        return trimmed.slice(0, 24);
      }
      function persistCallSign(name) {
        try {
          if (name) {
            window.localStorage.setItem(STORAGE_KEY, name);
          } else {
            window.localStorage.removeItem(STORAGE_KEY);
          }
        } catch (e) {
        }
      }
      function readStoredCallSign() {
        var _a;
        try {
          return (_a = window.localStorage.getItem(STORAGE_KEY)) != null ? _a : "";
        } catch (e) {
          return "";
        }
      }
      function buildRoomUrl(roomId, callSign, mode, mapSize, missionId) {
        let url = `${window.location.origin}/?room=${encodeURIComponent(roomId)}`;
        if (mode) {
          url += `&mode=${encodeURIComponent(mode)}`;
        }
        if (missionId) {
          url += `&mission=${encodeURIComponent(missionId)}`;
        }
        if (callSign) {
          url += `&name=${encodeURIComponent(callSign)}`;
        }
        if (mapSize) {
          url += `&mapW=${mapSize.w}&mapH=${mapSize.h}`;
        }
        return url;
      }
      function generateRoomId(prefix) {
        let slug = "";
        while (slug.length < 6) {
          slug = Math.random().toString(36).slice(2, 8);
        }
        if (prefix) {
          return `${prefix}-${slug}`;
        }
        return `r-${slug}`;
      }
      function showSaveStatus(message) {
        if (!saveStatus) {
          return;
        }
        saveStatus.textContent = message;
        if (saveStatusTimer !== null) {
          window.clearTimeout(saveStatusTimer);
        }
        saveStatusTimer = window.setTimeout(() => {
          if (saveStatus) {
            saveStatus.textContent = "";
          }
          saveStatusTimer = null;
        }, 2e3);
      }
    }
  });
  require_lobby();
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2J1cy50cyIsICJzcmMvc3RhdGUudHMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS90eXBlcy5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL2lzLW1lc3NhZ2UuanMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS9kZXNjcmlwdG9ycy5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL3dpcmUvdmFyaW50LmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vcHJvdG8taW50NjQuanMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS9yZWZsZWN0L3NjYWxhci5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL3JlZmxlY3QvdW5zYWZlLmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vcmVmbGVjdC9ndWFyZC5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL3drdC93cmFwcGVycy5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL2NyZWF0ZS5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL3JlZmxlY3QvZXJyb3IuanMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS93aXJlL3RleHQtZW5jb2RpbmcuanMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS93aXJlL2JpbmFyeS1lbmNvZGluZy5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL3JlZmxlY3QvcmVmbGVjdC1jaGVjay5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL3JlZmxlY3QvcmVmbGVjdC5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL2Nsb25lLmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vd2lyZS9iYXNlNjQtZW5jb2RpbmcuanMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS9yZWZsZWN0L25hbWVzLmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vY29kZWdlbnYyL3Jlc3RvcmUtanNvbi1uYW1lcy5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL3dpcmUvdGV4dC1mb3JtYXQuanMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS9yZWZsZWN0L25lc3RlZC10eXBlcy5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL3JlZ2lzdHJ5LmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vY29kZWdlbnYyL2Jvb3QuanMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS9jb2RlZ2VudjIvbWVzc2FnZS5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL2NvZGVnZW52Mi9lbnVtLmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vd2t0L2dlbi9nb29nbGUvcHJvdG9idWYvZGVzY3JpcHRvcl9wYi5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL2Zyb20tYmluYXJ5LmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vY29kZWdlbnYyL2ZpbGUuanMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS90by1iaW5hcnkuanMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS9jb2RlZ2VudjIvZXh0ZW5zaW9uLmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vZXF1YWxzLmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vZmllbGRzLmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vdG8tanNvbi5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL2Zyb20tanNvbi5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL21lcmdlLmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vaW5kZXguanMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS9jb2RlZ2VudjIvZW1iZWQuanMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS9jb2RlZ2VudjIvc2VydmljZS5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL2NvZGVnZW52Mi9zeW1ib2xzLmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vY29kZWdlbnYyL3NjYWxhci5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL2NvZGVnZW52Mi90eXBlcy5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL2NvZGVnZW52Mi9pbmRleC5qcyIsICJzcmMvcHJvdG8vcHJvdG8vd3NfbWVzc2FnZXNfcGIudHMiLCAic3JjL3Byb3RvX2hlbHBlcnMudHMiLCAic3JjL25ldC50cyIsICJzcmMvdXBncmFkZXMudHMiLCAic3JjL2xvYmJ5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgdHlwZSB7IE1pc3NpbGVTZWxlY3Rpb24gfSBmcm9tIFwiLi9zdGF0ZVwiO1xuaW1wb3J0IHR5cGUgeyBEaWFsb2d1ZUNvbnRlbnQgfSBmcm9tIFwiLi9zdG9yeS90eXBlc1wiO1xuXG5leHBvcnQgdHlwZSBTaGlwQ29udGV4dCA9IFwic2hpcFwiIHwgXCJtaXNzaWxlXCI7XG5leHBvcnQgdHlwZSBTaGlwVG9vbCA9IFwic2V0XCIgfCBcInNlbGVjdFwiIHwgbnVsbDtcbmV4cG9ydCB0eXBlIE1pc3NpbGVUb29sID0gXCJzZXRcIiB8IFwic2VsZWN0XCIgfCBudWxsO1xuXG5leHBvcnQgaW50ZXJmYWNlIEV2ZW50TWFwIHtcbiAgXCJjb250ZXh0OmNoYW5nZWRcIjogeyBjb250ZXh0OiBTaGlwQ29udGV4dCB9O1xuICBcInNoaXA6dG9vbENoYW5nZWRcIjogeyB0b29sOiBTaGlwVG9vbCB9O1xuICBcInNoaXA6d2F5cG9pbnRBZGRlZFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJzaGlwOndheXBvaW50TW92ZWRcIjogeyBpbmRleDogbnVtYmVyOyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xuICBcInNoaXA6bGVnU2VsZWN0ZWRcIjogeyBpbmRleDogbnVtYmVyIHwgbnVsbCB9O1xuICBcInNoaXA6d2F5cG9pbnREZWxldGVkXCI6IHsgaW5kZXg6IG51bWJlciB9O1xuICBcInNoaXA6d2F5cG9pbnRzQ2xlYXJlZFwiOiB2b2lkO1xuICBcInNoaXA6Y2xlYXJJbnZva2VkXCI6IHZvaWQ7XG4gIFwic2hpcDpzcGVlZENoYW5nZWRcIjogeyB2YWx1ZTogbnVtYmVyIH07XG4gIFwic2hpcDpoZWF0UHJvamVjdGlvblVwZGF0ZWRcIjogeyBoZWF0VmFsdWVzOiBudW1iZXJbXSB9O1xuICBcImhlYXQ6bWFya2VyQWxpZ25lZFwiOiB7IHZhbHVlOiBudW1iZXI7IG1hcmtlcjogbnVtYmVyIH07XG4gIFwiaGVhdDp3YXJuRW50ZXJlZFwiOiB7IHZhbHVlOiBudW1iZXI7IHdhcm5BdDogbnVtYmVyIH07XG4gIFwiaGVhdDpjb29sZWRCZWxvd1dhcm5cIjogeyB2YWx1ZTogbnVtYmVyOyB3YXJuQXQ6IG51bWJlciB9O1xuICBcImhlYXQ6c3RhbGxUcmlnZ2VyZWRcIjogeyBzdGFsbFVudGlsOiBudW1iZXIgfTtcbiAgXCJoZWF0OnN0YWxsUmVjb3ZlcmVkXCI6IHsgdmFsdWU6IG51bWJlciB9O1xuICBcImhlYXQ6ZHVhbE1ldGVyRGl2ZXJnZWRcIjogeyBwbGFubmVkOiBudW1iZXI7IGFjdHVhbDogbnVtYmVyIH07XG4gIFwidWk6d2F5cG9pbnRIb3ZlclN0YXJ0XCI6IHsgaW5kZXg6IG51bWJlciB9O1xuICBcInVpOndheXBvaW50SG92ZXJFbmRcIjogeyBpbmRleDogbnVtYmVyIH07XG4gIFwibWlzc2lsZTpyb3V0ZUFkZGVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpyb3V0ZURlbGV0ZWRcIjogeyByb3V0ZUlkOiBzdHJpbmcgfTtcbiAgXCJtaXNzaWxlOnJvdXRlUmVuYW1lZFwiOiB7IHJvdXRlSWQ6IHN0cmluZzsgbmFtZTogc3RyaW5nIH07XG4gIFwibWlzc2lsZTphY3RpdmVSb3V0ZUNoYW5nZWRcIjogeyByb3V0ZUlkOiBzdHJpbmcgfCBudWxsIH07XG4gIFwibWlzc2lsZTp0b29sQ2hhbmdlZFwiOiB7IHRvb2w6IE1pc3NpbGVUb29sIH07XG4gIFwibWlzc2lsZTpzZWxlY3Rpb25DaGFuZ2VkXCI6IHsgc2VsZWN0aW9uOiBNaXNzaWxlU2VsZWN0aW9uIHwgbnVsbCB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZzsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnRNb3ZlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZzsgaW5kZXg6IG51bWJlcjsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOndheXBvaW50RGVsZXRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZzsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnRzQ2xlYXJlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6c3BlZWRDaGFuZ2VkXCI6IHsgdmFsdWU6IG51bWJlcjsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6YWdyb0NoYW5nZWRcIjogeyB2YWx1ZTogbnVtYmVyIH07XG4gIFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIjogeyByb3V0ZUlkOiBzdHJpbmcgfTtcbiAgXCJtaXNzaWxlOmxhdW5jaGVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpjb29sZG93blVwZGF0ZWRcIjogeyBzZWNvbmRzUmVtYWluaW5nOiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOmRlbGV0ZUludm9rZWRcIjogdm9pZDtcbiAgXCJtaXNzaWxlOnByZXNldFNlbGVjdGVkXCI6IHsgcHJlc2V0TmFtZTogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpoZWF0UHJvamVjdGlvblVwZGF0ZWRcIjogeyB3aWxsT3ZlcmhlYXQ6IGJvb2xlYW47IG92ZXJoZWF0QXQ/OiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOm92ZXJoZWF0ZWRcIjogeyBtaXNzaWxlSWQ6IHN0cmluZzsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOmNyYWZ0UmVxdWVzdGVkXCI6IHsgbm9kZUlkOiBzdHJpbmc7IGhlYXRDYXBhY2l0eTogbnVtYmVyIH07XG4gIFwiaGVscDp2aXNpYmxlQ2hhbmdlZFwiOiB7IHZpc2libGU6IGJvb2xlYW4gfTtcbiAgXCJzdGF0ZTp1cGRhdGVkXCI6IHZvaWQ7XG4gIFwiY29ubmVjdGlvbjplcnJvclwiOiB7IG1lc3NhZ2U6IHN0cmluZyB9O1xuICBcImRhZzpsaXN0XCI6IHsgbm9kZXM6IEFycmF5PHsgaWQ6IHN0cmluZzsga2luZDogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyBzdGF0dXM6IHN0cmluZzsgcmVtYWluaW5nX3M6IG51bWJlcjsgZHVyYXRpb25fczogbnVtYmVyOyByZXBlYXRhYmxlOiBib29sZWFuIH0+IH07XG4gIFwidHV0b3JpYWw6c3RhcnRlZFwiOiB7IGlkOiBzdHJpbmcgfTtcbiAgXCJ0dXRvcmlhbDpzdGVwQ2hhbmdlZFwiOiB7IGlkOiBzdHJpbmc7IHN0ZXBJbmRleDogbnVtYmVyOyB0b3RhbDogbnVtYmVyIH07XG4gIFwidHV0b3JpYWw6Y29tcGxldGVkXCI6IHsgaWQ6IHN0cmluZyB9O1xuICBcInR1dG9yaWFsOnNraXBwZWRcIjogeyBpZDogc3RyaW5nOyBhdFN0ZXA6IG51bWJlciB9O1xuICBcImJvdDpzcGF3blJlcXVlc3RlZFwiOiB2b2lkO1xuICBcImRpYWxvZ3VlOm9wZW5lZFwiOiB7IG5vZGVJZDogc3RyaW5nOyBjaGFwdGVySWQ6IHN0cmluZyB9O1xuICBcImRpYWxvZ3VlOmNsb3NlZFwiOiB7IG5vZGVJZDogc3RyaW5nOyBjaGFwdGVySWQ6IHN0cmluZyB9O1xuICBcImRpYWxvZ3VlOmNob2ljZVwiOiB7IG5vZGVJZDogc3RyaW5nOyBjaG9pY2VJZDogc3RyaW5nOyBjaGFwdGVySWQ6IHN0cmluZyB9O1xuICBcInN0b3J5OmZsYWdVcGRhdGVkXCI6IHsgZmxhZzogc3RyaW5nOyB2YWx1ZTogYm9vbGVhbiB9O1xuICBcInN0b3J5OnByb2dyZXNzZWRcIjogeyBjaGFwdGVySWQ6IHN0cmluZzsgbm9kZUlkOiBzdHJpbmcgfTtcbiAgXCJzdG9yeTpub2RlQWN0aXZhdGVkXCI6IHsgbm9kZUlkOiBzdHJpbmc7IGRpYWxvZ3VlPzogRGlhbG9ndWVDb250ZW50IH07XG4gIFwibWlzc2lvbjpzdGFydFwiOiB2b2lkO1xuICBcIm1pc3Npb246YmVhY29uLWxvY2tlZFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJtaXNzaW9uOmNvbXBsZXRlZFwiOiB2b2lkO1xuICBcImF1ZGlvOnJlc3VtZVwiOiB2b2lkO1xuICBcImF1ZGlvOm11dGVcIjogdm9pZDtcbiAgXCJhdWRpbzp1bm11dGVcIjogdm9pZDtcbiAgXCJhdWRpbzpzZXQtbWFzdGVyLWdhaW5cIjogeyBnYWluOiBudW1iZXIgfTtcbiAgXCJhdWRpbzpzZnhcIjogeyBuYW1lOiBcInVpXCIgfCBcImxhc2VyXCIgfCBcInRocnVzdFwiIHwgXCJleHBsb3Npb25cIiB8IFwibG9ja1wiIHwgXCJkaWFsb2d1ZVwiOyB2ZWxvY2l0eT86IG51bWJlcjsgcGFuPzogbnVtYmVyIH07XG4gIFwiYXVkaW86bXVzaWM6c2V0LXNjZW5lXCI6IHsgc2NlbmU6IFwiYW1iaWVudFwiIHwgXCJjb21iYXRcIiB8IFwibG9iYnlcIjsgc2VlZD86IG51bWJlciB9O1xuICBcImF1ZGlvOm11c2ljOnBhcmFtXCI6IHsga2V5OiBzdHJpbmc7IHZhbHVlOiBudW1iZXIgfTtcbiAgXCJhdWRpbzptdXNpYzp0cmFuc3BvcnRcIjogeyBjbWQ6IFwic3RhcnRcIiB8IFwic3RvcFwiIHwgXCJwYXVzZVwiIH07XG4gIFwidXBncmFkZXM6dG9nZ2xlXCI6IHZvaWQ7XG4gIFwidXBncmFkZXM6c2hvd1wiOiB2b2lkO1xuICBcInVwZ3JhZGVzOmhpZGVcIjogdm9pZDtcbiAgXCJ1cGdyYWRlczpjb3VudFVwZGF0ZWRcIjogeyBjb3VudDogbnVtYmVyIH07XG59XG5cbmV4cG9ydCB0eXBlIEV2ZW50S2V5ID0ga2V5b2YgRXZlbnRNYXA7XG5leHBvcnQgdHlwZSBFdmVudFBheWxvYWQ8SyBleHRlbmRzIEV2ZW50S2V5PiA9IEV2ZW50TWFwW0tdO1xuZXhwb3J0IHR5cGUgSGFuZGxlcjxLIGV4dGVuZHMgRXZlbnRLZXk+ID0gKHBheWxvYWQ6IEV2ZW50UGF5bG9hZDxLPikgPT4gdm9pZDtcblxudHlwZSBWb2lkS2V5cyA9IHtcbiAgW0sgaW4gRXZlbnRLZXldOiBFdmVudE1hcFtLXSBleHRlbmRzIHZvaWQgPyBLIDogbmV2ZXJcbn1bRXZlbnRLZXldO1xuXG50eXBlIE5vblZvaWRLZXlzID0gRXhjbHVkZTxFdmVudEtleSwgVm9pZEtleXM+O1xuXG5leHBvcnQgaW50ZXJmYWNlIEV2ZW50QnVzIHtcbiAgb248SyBleHRlbmRzIEV2ZW50S2V5PihldmVudDogSywgaGFuZGxlcjogSGFuZGxlcjxLPik6ICgpID0+IHZvaWQ7XG4gIGVtaXQ8SyBleHRlbmRzIE5vblZvaWRLZXlzPihldmVudDogSywgcGF5bG9hZDogRXZlbnRQYXlsb2FkPEs+KTogdm9pZDtcbiAgZW1pdDxLIGV4dGVuZHMgVm9pZEtleXM+KGV2ZW50OiBLKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUV2ZW50QnVzKCk6IEV2ZW50QnVzIHtcbiAgY29uc3QgaGFuZGxlcnMgPSBuZXcgTWFwPEV2ZW50S2V5LCBTZXQ8RnVuY3Rpb24+PigpO1xuICByZXR1cm4ge1xuICAgIG9uKGV2ZW50LCBoYW5kbGVyKSB7XG4gICAgICBsZXQgc2V0ID0gaGFuZGxlcnMuZ2V0KGV2ZW50KTtcbiAgICAgIGlmICghc2V0KSB7XG4gICAgICAgIHNldCA9IG5ldyBTZXQoKTtcbiAgICAgICAgaGFuZGxlcnMuc2V0KGV2ZW50LCBzZXQpO1xuICAgICAgfVxuICAgICAgc2V0LmFkZChoYW5kbGVyKTtcbiAgICAgIHJldHVybiAoKSA9PiBzZXQhLmRlbGV0ZShoYW5kbGVyKTtcbiAgICB9LFxuICAgIGVtaXQoZXZlbnQ6IEV2ZW50S2V5LCBwYXlsb2FkPzogdW5rbm93bikge1xuICAgICAgY29uc3Qgc2V0ID0gaGFuZGxlcnMuZ2V0KGV2ZW50KTtcbiAgICAgIGlmICghc2V0IHx8IHNldC5zaXplID09PSAwKSByZXR1cm47XG4gICAgICBmb3IgKGNvbnN0IGZuIG9mIHNldCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIChmbiBhcyAodmFsdWU/OiB1bmtub3duKSA9PiB2b2lkKShwYXlsb2FkKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihgW2J1c10gaGFuZGxlciBmb3IgJHtldmVudH0gZmFpbGVkYCwgZXJyKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gIH07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBTaGlwQ29udGV4dCwgU2hpcFRvb2wsIE1pc3NpbGVUb29sIH0gZnJvbSBcIi4vYnVzXCI7XG5pbXBvcnQgdHlwZSB7IERpYWxvZ3VlQ29udGVudCB9IGZyb20gXCIuL3N0b3J5L3R5cGVzXCI7XG5cbmV4cG9ydCBjb25zdCBNSVNTSUxFX01JTl9TUEVFRCA9IDQwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTUFYX1NQRUVEID0gMjUwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTUlOX0FHUk8gPSAxMDA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9NQVhfTElGRVRJTUUgPSAxMjA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9NSU5fTElGRVRJTUUgPSAyMDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX0xJRkVUSU1FX1NQRUVEX1BFTkFMVFkgPSA4MDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX0xJRkVUSU1FX0FHUk9fUEVOQUxUWSA9IDQwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTElGRVRJTUVfQUdST19SRUYgPSAyMDAwO1xuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVMaW1pdHMge1xuICBzcGVlZE1pbjogbnVtYmVyO1xuICBzcGVlZE1heDogbnVtYmVyO1xuICBhZ3JvTWluOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgV2F5cG9pbnQge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgc3BlZWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIZWF0VmlldyB7XG4gIHZhbHVlOiBudW1iZXI7XG4gIG1heDogbnVtYmVyO1xuICB3YXJuQXQ6IG51bWJlcjtcbiAgb3ZlcmhlYXRBdDogbnVtYmVyO1xuICBtYXJrZXJTcGVlZDogbnVtYmVyO1xuICBzdGFsbFVudGlsTXM6IG51bWJlcjsgLy8gY2xpZW50LXN5bmNlZCB0aW1lIGluIG1pbGxpc2Vjb25kc1xuICBrVXA6IG51bWJlcjtcbiAga0Rvd246IG51bWJlcjtcbiAgZXhwOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2hpcFNuYXBzaG90IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHZ4OiBudW1iZXI7XG4gIHZ5OiBudW1iZXI7XG4gIGhwPzogbnVtYmVyO1xuICBraWxscz86IG51bWJlcjtcbiAgd2F5cG9pbnRzOiBXYXlwb2ludFtdO1xuICBjdXJyZW50V2F5cG9pbnRJbmRleD86IG51bWJlcjtcbiAgaGVhdD86IEhlYXRWaWV3O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEdob3N0U25hcHNob3Qge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlU25hcHNob3Qge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbiAgc2VsZj86IGJvb2xlYW47XG4gIGFncm9fcmFkaXVzOiBudW1iZXI7XG4gIGhlYXQ/OiBIZWF0VmlldzsgLy8gTWlzc2lsZSBoZWF0IGRhdGFcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlUm91dGUge1xuICBpZDogc3RyaW5nO1xuICBuYW1lOiBzdHJpbmc7XG4gIHdheXBvaW50czogV2F5cG9pbnRbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIZWF0UGFyYW1zIHtcbiAgbWF4OiBudW1iZXI7XG4gIHdhcm5BdDogbnVtYmVyO1xuICBvdmVyaGVhdEF0OiBudW1iZXI7XG4gIG1hcmtlclNwZWVkOiBudW1iZXI7XG4gIGtVcDogbnVtYmVyO1xuICBrRG93bjogbnVtYmVyO1xuICBleHA6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlQ29uZmlnIHtcbiAgc3BlZWQ6IG51bWJlcjtcbiAgYWdyb1JhZGl1czogbnVtYmVyO1xuICBsaWZldGltZTogbnVtYmVyO1xuICBoZWF0UGFyYW1zPzogSGVhdFBhcmFtczsgLy8gT3B0aW9uYWwgY3VzdG9tIGhlYXQgY29uZmlndXJhdGlvblxufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVQcmVzZXQge1xuICBuYW1lOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIHNwZWVkOiBudW1iZXI7XG4gIGFncm9SYWRpdXM6IG51bWJlcjtcbiAgaGVhdFBhcmFtczogSGVhdFBhcmFtcztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJbnZlbnRvcnlJdGVtIHtcbiAgdHlwZTogc3RyaW5nO1xuICB2YXJpYW50X2lkOiBzdHJpbmc7XG4gIGhlYXRfY2FwYWNpdHk6IG51bWJlcjtcbiAgcXVhbnRpdHk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJbnZlbnRvcnkge1xuICBpdGVtczogSW52ZW50b3J5SXRlbVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFVwZ3JhZGVFZmZlY3REYXRhIHtcbiAgdHlwZTogc3RyaW5nOyAvLyAnc3BlZWRfbXVsdGlwbGllcicsICdtaXNzaWxlX3VubG9jaycsIGV0Yy5cbiAgdmFsdWU6IG51bWJlciB8IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBEYWdOb2RlIHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogc3RyaW5nO1xuICBsYWJlbDogc3RyaW5nO1xuICBzdGF0dXM6IHN0cmluZzsgLy8gXCJsb2NrZWRcIiB8IFwiYXZhaWxhYmxlXCIgfCBcImluX3Byb2dyZXNzXCIgfCBcImNvbXBsZXRlZFwiXG4gIHJlbWFpbmluZ19zOiBudW1iZXI7XG4gIGR1cmF0aW9uX3M6IG51bWJlcjtcbiAgcmVwZWF0YWJsZTogYm9vbGVhbjtcbiAgZWZmZWN0cz86IFVwZ3JhZGVFZmZlY3REYXRhW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGFnU3RhdGUge1xuICBub2RlczogRGFnTm9kZVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBsYXllckNhcGFiaWxpdGllcyB7XG4gIHNwZWVkTXVsdGlwbGllcjogbnVtYmVyO1xuICB1bmxvY2tlZE1pc3NpbGVzOiBzdHJpbmdbXTtcbiAgaGVhdENhcGFjaXR5OiBudW1iZXI7XG4gIGhlYXRFZmZpY2llbmN5OiBudW1iZXI7XG59XG5cbi8vIE1pc3NpbGUgcHJlc2V0IGRlZmluaXRpb25zIG1hdGNoaW5nIGJhY2tlbmRcbmV4cG9ydCBjb25zdCBNSVNTSUxFX1BSRVNFVFM6IE1pc3NpbGVQcmVzZXRbXSA9IFtcbiAge1xuICAgIG5hbWU6IFwiU2NvdXRcIixcbiAgICBkZXNjcmlwdGlvbjogXCJTbG93LCBlZmZpY2llbnQsIGxvbmctcmFuZ2UuIEhpZ2ggaGVhdCBjYXBhY2l0eS5cIixcbiAgICBzcGVlZDogODAsXG4gICAgYWdyb1JhZGl1czogMTUwMCxcbiAgICBoZWF0UGFyYW1zOiB7XG4gICAgICBtYXg6IDYwLFxuICAgICAgd2FybkF0OiA0MixcbiAgICAgIG92ZXJoZWF0QXQ6IDYwLFxuICAgICAgbWFya2VyU3BlZWQ6IDcwLFxuICAgICAga1VwOiAyMCxcbiAgICAgIGtEb3duOiAxNSxcbiAgICAgIGV4cDogMS41LFxuICAgIH0sXG4gIH0sXG4gIHtcbiAgICBuYW1lOiBcIkh1bnRlclwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIkJhbGFuY2VkIHNwZWVkIGFuZCBkZXRlY3Rpb24uIFN0YW5kYXJkIGhlYXQuXCIsXG4gICAgc3BlZWQ6IDE1MCxcbiAgICBhZ3JvUmFkaXVzOiA4MDAsXG4gICAgaGVhdFBhcmFtczoge1xuICAgICAgbWF4OiA1MCxcbiAgICAgIHdhcm5BdDogMzUsXG4gICAgICBvdmVyaGVhdEF0OiA1MCxcbiAgICAgIG1hcmtlclNwZWVkOiAxMjAsXG4gICAgICBrVXA6IDI4LFxuICAgICAga0Rvd246IDEyLFxuICAgICAgZXhwOiAxLjUsXG4gICAgfSxcbiAgfSxcbiAge1xuICAgIG5hbWU6IFwiU25pcGVyXCIsXG4gICAgZGVzY3JpcHRpb246IFwiRmFzdCwgbmFycm93IGRldGVjdGlvbi4gTG93IGhlYXQgY2FwYWNpdHkuXCIsXG4gICAgc3BlZWQ6IDIyMCxcbiAgICBhZ3JvUmFkaXVzOiAzMDAsXG4gICAgaGVhdFBhcmFtczoge1xuICAgICAgbWF4OiA0MCxcbiAgICAgIHdhcm5BdDogMjgsXG4gICAgICBvdmVyaGVhdEF0OiA0MCxcbiAgICAgIG1hcmtlclNwZWVkOiAxODAsXG4gICAgICBrVXA6IDM1LFxuICAgICAga0Rvd246IDgsXG4gICAgICBleHA6IDEuNSxcbiAgICB9LFxuICB9LFxuXTtcblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZE1ldGEge1xuICBjPzogbnVtYmVyO1xuICB3PzogbnVtYmVyO1xuICBoPzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEJlYWNvbkRlZmluaXRpb24ge1xuICBjeDogbnVtYmVyO1xuICBjeTogbnVtYmVyO1xuICByYWRpdXM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaW9uU3RhdGUge1xuICBhY3RpdmU6IGJvb2xlYW47XG4gIG1pc3Npb25JZDogc3RyaW5nO1xuICBiZWFjb25JbmRleDogbnVtYmVyO1xuICBob2xkQWNjdW06IG51bWJlcjtcbiAgaG9sZFJlcXVpcmVkOiBudW1iZXI7XG4gIGJlYWNvbnM6IEJlYWNvbkRlZmluaXRpb25bXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdG9yeUV2ZW50IHtcbiAgY2hhcHRlcjogc3RyaW5nO1xuICBub2RlOiBzdHJpbmc7XG4gIHRpbWVzdGFtcDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3J5U3RhdGUge1xuICBhY3RpdmVOb2RlOiBzdHJpbmcgfCBudWxsO1xuICBkaWFsb2d1ZTogRGlhbG9ndWVDb250ZW50IHwgbnVsbDtcbiAgYXZhaWxhYmxlOiBzdHJpbmdbXTtcbiAgZmxhZ3M6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+O1xuICByZWNlbnRFdmVudHM6IFN0b3J5RXZlbnRbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBcHBTdGF0ZSB7XG4gIG5vdzogbnVtYmVyO1xuICBub3dTeW5jZWRBdDogbnVtYmVyO1xuICBtZTogU2hpcFNuYXBzaG90IHwgbnVsbDtcbiAgZ2hvc3RzOiBHaG9zdFNuYXBzaG90W107XG4gIG1pc3NpbGVzOiBNaXNzaWxlU25hcHNob3RbXTtcbiAgbWlzc2lsZVJvdXRlczogTWlzc2lsZVJvdXRlW107XG4gIGFjdGl2ZU1pc3NpbGVSb3V0ZUlkOiBzdHJpbmcgfCBudWxsO1xuICBuZXh0TWlzc2lsZVJlYWR5QXQ6IG51bWJlcjtcbiAgbWlzc2lsZUNvbmZpZzogTWlzc2lsZUNvbmZpZztcbiAgbWlzc2lsZUxpbWl0czogTWlzc2lsZUxpbWl0cztcbiAgd29ybGRNZXRhOiBXb3JsZE1ldGE7XG4gIGludmVudG9yeTogSW52ZW50b3J5IHwgbnVsbDtcbiAgZGFnOiBEYWdTdGF0ZSB8IG51bGw7XG4gIG1pc3Npb246IE1pc3Npb25TdGF0ZSB8IG51bGw7XG4gIHN0b3J5OiBTdG9yeVN0YXRlIHwgbnVsbDtcbiAgY3JhZnRIZWF0Q2FwYWNpdHk6IG51bWJlcjsgLy8gSGVhdCBjYXBhY2l0eSBzbGlkZXIgdmFsdWUgZm9yIGNyYWZ0aW5nXG4gIGNhcGFiaWxpdGllczogUGxheWVyQ2FwYWJpbGl0aWVzIHwgbnVsbDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTZWxlY3Rpb24ge1xuICB0eXBlOiBcIndheXBvaW50XCIgfCBcImxlZ1wiO1xuICBpbmRleDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVTZWxlY3Rpb24ge1xuICB0eXBlOiBcIndheXBvaW50XCIgfCBcImxlZ1wiO1xuICBpbmRleDogbnVtYmVyO1xufVxuXG5leHBvcnQgdHlwZSBBY3RpdmVUb29sID1cbiAgfCBcInNoaXAtc2V0XCJcbiAgfCBcInNoaXAtc2VsZWN0XCJcbiAgfCBcIm1pc3NpbGUtc2V0XCJcbiAgfCBcIm1pc3NpbGUtc2VsZWN0XCJcbiAgfCBudWxsO1xuXG5leHBvcnQgaW50ZXJmYWNlIFVJU3RhdGUge1xuICBpbnB1dENvbnRleHQ6IFNoaXBDb250ZXh0O1xuICBzaGlwVG9vbDogU2hpcFRvb2w7XG4gIG1pc3NpbGVUb29sOiBNaXNzaWxlVG9vbDtcbiAgYWN0aXZlVG9vbDogQWN0aXZlVG9vbDtcbiAgc2hvd1NoaXBSb3V0ZTogYm9vbGVhbjtcbiAgaGVscFZpc2libGU6IGJvb2xlYW47XG4gIHpvb206IG51bWJlcjtcbiAgcGFuWDogbnVtYmVyO1xuICBwYW5ZOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVJbml0aWFsVUlTdGF0ZSgpOiBVSVN0YXRlIHtcbiAgcmV0dXJuIHtcbiAgICBpbnB1dENvbnRleHQ6IFwic2hpcFwiLFxuICAgIHNoaXBUb29sOiBcInNldFwiLFxuICAgIG1pc3NpbGVUb29sOiBudWxsLFxuICAgIGFjdGl2ZVRvb2w6IFwic2hpcC1zZXRcIixcbiAgICBzaG93U2hpcFJvdXRlOiB0cnVlLFxuICAgIGhlbHBWaXNpYmxlOiBmYWxzZSxcbiAgICB6b29tOiAxLjAsXG4gICAgcGFuWDogMCxcbiAgICBwYW5ZOiAwLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlSW5pdGlhbFN0YXRlKGxpbWl0czogTWlzc2lsZUxpbWl0cyA9IHtcbiAgc3BlZWRNaW46IE1JU1NJTEVfTUlOX1NQRUVELFxuICBzcGVlZE1heDogTUlTU0lMRV9NQVhfU1BFRUQsXG4gIGFncm9NaW46IE1JU1NJTEVfTUlOX0FHUk8sXG59KTogQXBwU3RhdGUge1xuICByZXR1cm4ge1xuICAgIG5vdzogMCxcbiAgICBub3dTeW5jZWRBdDogdHlwZW9mIHBlcmZvcm1hbmNlICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiBwZXJmb3JtYW5jZS5ub3cgPT09IFwiZnVuY3Rpb25cIlxuICAgICAgPyBwZXJmb3JtYW5jZS5ub3coKVxuICAgICAgOiBEYXRlLm5vdygpLFxuICAgIG1lOiBudWxsLFxuICAgIGdob3N0czogW10sXG4gICAgbWlzc2lsZXM6IFtdLFxuICAgIG1pc3NpbGVSb3V0ZXM6IFtdLFxuICAgIGFjdGl2ZU1pc3NpbGVSb3V0ZUlkOiBudWxsLFxuICAgIG5leHRNaXNzaWxlUmVhZHlBdDogMCxcbiAgICBtaXNzaWxlQ29uZmlnOiB7XG4gICAgICBzcGVlZDogMTgwLFxuICAgICAgYWdyb1JhZGl1czogODAwLFxuICAgICAgbGlmZXRpbWU6IG1pc3NpbGVMaWZldGltZUZvcigxODAsIDgwMCwgbGltaXRzKSxcbiAgICAgIGhlYXRQYXJhbXM6IE1JU1NJTEVfUFJFU0VUU1sxXS5oZWF0UGFyYW1zLCAvLyBEZWZhdWx0IHRvIEh1bnRlciBwcmVzZXRcbiAgICB9LFxuICAgIG1pc3NpbGVMaW1pdHM6IGxpbWl0cyxcbiAgICB3b3JsZE1ldGE6IHt9LFxuICAgIGludmVudG9yeTogbnVsbCxcbiAgICBkYWc6IG51bGwsXG4gICAgbWlzc2lvbjogbnVsbCxcbiAgICBzdG9yeTogbnVsbCxcbiAgICBjcmFmdEhlYXRDYXBhY2l0eTogODAsIC8vIERlZmF1bHQgdG8gYmFzaWMgbWlzc2lsZSBoZWF0IGNhcGFjaXR5XG4gICAgY2FwYWJpbGl0aWVzOiBudWxsLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xhbXAodmFsdWU6IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgubWF4KG1pbiwgTWF0aC5taW4obWF4LCB2YWx1ZSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWlzc2lsZUxpZmV0aW1lRm9yKHNwZWVkOiBudW1iZXIsIGFncm9SYWRpdXM6IG51bWJlciwgbGltaXRzOiBNaXNzaWxlTGltaXRzID0ge1xuICBzcGVlZE1pbjogTUlTU0lMRV9NSU5fU1BFRUQsXG4gIHNwZWVkTWF4OiBNSVNTSUxFX01BWF9TUEVFRCxcbiAgYWdyb01pbjogTUlTU0lMRV9NSU5fQUdSTyxcbn0pOiBudW1iZXIge1xuICBjb25zdCBtaW5TcGVlZCA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNaW4pID8gbGltaXRzLnNwZWVkTWluIDogTUlTU0lMRV9NSU5fU1BFRUQ7XG4gIGNvbnN0IG1heFNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1heCkgPyBsaW1pdHMuc3BlZWRNYXggOiBNSVNTSUxFX01BWF9TUEVFRDtcbiAgY29uc3QgbWluQWdybyA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuYWdyb01pbikgPyBsaW1pdHMuYWdyb01pbiA6IE1JU1NJTEVfTUlOX0FHUk87XG4gIGNvbnN0IHNwYW4gPSBtYXhTcGVlZCAtIG1pblNwZWVkO1xuICBjb25zdCBzcGVlZE5vcm0gPSBzcGFuID4gMCA/IGNsYW1wKChzcGVlZCAtIG1pblNwZWVkKSAvIHNwYW4sIDAsIDEpIDogMDtcbiAgY29uc3QgYWRqdXN0ZWRBZ3JvID0gTWF0aC5tYXgoMCwgYWdyb1JhZGl1cyAtIG1pbkFncm8pO1xuICBjb25zdCBhZ3JvTm9ybSA9IGNsYW1wKGFkanVzdGVkQWdybyAvIE1JU1NJTEVfTElGRVRJTUVfQUdST19SRUYsIDAsIDEpO1xuICBjb25zdCByZWR1Y3Rpb24gPSBzcGVlZE5vcm0gKiBNSVNTSUxFX0xJRkVUSU1FX1NQRUVEX1BFTkFMVFkgKyBhZ3JvTm9ybSAqIE1JU1NJTEVfTElGRVRJTUVfQUdST19QRU5BTFRZO1xuICBjb25zdCBiYXNlID0gTUlTU0lMRV9NQVhfTElGRVRJTUU7XG4gIHJldHVybiBjbGFtcChiYXNlIC0gcmVkdWN0aW9uLCBNSVNTSUxFX01JTl9MSUZFVElNRSwgTUlTU0lMRV9NQVhfTElGRVRJTUUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2FuaXRpemVNaXNzaWxlQ29uZmlnKFxuICBjZmc6IFBhcnRpYWw8UGljazxNaXNzaWxlQ29uZmlnLCBcInNwZWVkXCIgfCBcImFncm9SYWRpdXNcIiB8IFwiaGVhdFBhcmFtc1wiPj4sXG4gIGZhbGxiYWNrOiBNaXNzaWxlQ29uZmlnLFxuICBsaW1pdHM6IE1pc3NpbGVMaW1pdHMsXG4pOiBNaXNzaWxlQ29uZmlnIHtcbiAgY29uc3QgbWluU3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWluKSA/IGxpbWl0cy5zcGVlZE1pbiA6IE1JU1NJTEVfTUlOX1NQRUVEO1xuICBjb25zdCBtYXhTcGVlZCA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNYXgpID8gbGltaXRzLnNwZWVkTWF4IDogTUlTU0lMRV9NQVhfU1BFRUQ7XG4gIGNvbnN0IG1pbkFncm8gPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLmFncm9NaW4pID8gbGltaXRzLmFncm9NaW4gOiBNSVNTSUxFX01JTl9BR1JPO1xuICBjb25zdCBiYXNlID0gZmFsbGJhY2sgPz8ge1xuICAgIHNwZWVkOiBtaW5TcGVlZCxcbiAgICBhZ3JvUmFkaXVzOiBtaW5BZ3JvLFxuICAgIGxpZmV0aW1lOiBtaXNzaWxlTGlmZXRpbWVGb3IobWluU3BlZWQsIG1pbkFncm8sIGxpbWl0cyksXG4gIH07XG4gIGNvbnN0IG1lcmdlZFNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGNmZy5zcGVlZCA/PyBiYXNlLnNwZWVkKSA/IChjZmcuc3BlZWQgPz8gYmFzZS5zcGVlZCkgOiBiYXNlLnNwZWVkO1xuICBjb25zdCBtZXJnZWRBZ3JvID0gTnVtYmVyLmlzRmluaXRlKGNmZy5hZ3JvUmFkaXVzID8/IGJhc2UuYWdyb1JhZGl1cykgPyAoY2ZnLmFncm9SYWRpdXMgPz8gYmFzZS5hZ3JvUmFkaXVzKSA6IGJhc2UuYWdyb1JhZGl1cztcbiAgY29uc3Qgc3BlZWQgPSBjbGFtcChtZXJnZWRTcGVlZCwgbWluU3BlZWQsIG1heFNwZWVkKTtcbiAgY29uc3QgYWdyb1JhZGl1cyA9IE1hdGgubWF4KG1pbkFncm8sIG1lcmdlZEFncm8pO1xuICBjb25zdCBoZWF0UGFyYW1zID0gY2ZnLmhlYXRQYXJhbXMgPyB7IC4uLmNmZy5oZWF0UGFyYW1zIH0gOiBiYXNlLmhlYXRQYXJhbXMgPyB7IC4uLmJhc2UuaGVhdFBhcmFtcyB9IDogdW5kZWZpbmVkO1xuICByZXR1cm4ge1xuICAgIHNwZWVkLFxuICAgIGFncm9SYWRpdXMsXG4gICAgbGlmZXRpbWU6IG1pc3NpbGVMaWZldGltZUZvcihzcGVlZCwgYWdyb1JhZGl1cywgbGltaXRzKSxcbiAgICBoZWF0UGFyYW1zLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW9ub3RvbmljTm93KCk6IG51bWJlciB7XG4gIGlmICh0eXBlb2YgcGVyZm9ybWFuY2UgIT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIHBlcmZvcm1hbmNlLm5vdyA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgcmV0dXJuIHBlcmZvcm1hbmNlLm5vdygpO1xuICB9XG4gIHJldHVybiBEYXRlLm5vdygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xvbmVXYXlwb2ludExpc3QobGlzdDogV2F5cG9pbnRbXSB8IHVuZGVmaW5lZCB8IG51bGwpOiBXYXlwb2ludFtdIHtcbiAgaWYgKCFBcnJheS5pc0FycmF5KGxpc3QpKSByZXR1cm4gW107XG4gIHJldHVybiBsaXN0Lm1hcCgod3ApID0+ICh7IC4uLndwIH0pKTtcbn1cblxuLy8gUHJvamVjdCBoZWF0IGFsb25nIGEgbWlzc2lsZSByb3V0ZVxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlUm91dGVQcm9qZWN0aW9uIHtcbiAgd2F5cG9pbnRzOiBXYXlwb2ludFtdO1xuICBoZWF0QXRXYXlwb2ludHM6IG51bWJlcltdO1xuICB3aWxsT3ZlcmhlYXQ6IGJvb2xlYW47XG4gIG92ZXJoZWF0QXQ/OiBudW1iZXI7IC8vIEluZGV4IHdoZXJlIG92ZXJoZWF0IG9jY3Vyc1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvamVjdE1pc3NpbGVIZWF0KFxuICByb3V0ZTogV2F5cG9pbnRbXSxcbiAgZGVmYXVsdFNwZWVkOiBudW1iZXIsXG4gIGhlYXRQYXJhbXM6IEhlYXRQYXJhbXNcbik6IE1pc3NpbGVSb3V0ZVByb2plY3Rpb24ge1xuICBjb25zdCBwcm9qZWN0aW9uOiBNaXNzaWxlUm91dGVQcm9qZWN0aW9uID0ge1xuICAgIHdheXBvaW50czogcm91dGUsXG4gICAgaGVhdEF0V2F5cG9pbnRzOiBbXSxcbiAgICB3aWxsT3ZlcmhlYXQ6IGZhbHNlLFxuICB9O1xuXG4gIGlmIChyb3V0ZS5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gcHJvamVjdGlvbjtcbiAgfVxuXG4gIGxldCBoZWF0ID0gMDsgLy8gTWlzc2lsZXMgc3RhcnQgYXQgemVybyBoZWF0XG4gIGxldCBwb3MgPSB7IHg6IHJvdXRlWzBdLngsIHk6IHJvdXRlWzBdLnkgfTtcbiAgbGV0IGN1cnJlbnRTcGVlZCA9IHJvdXRlWzBdLnNwZWVkID4gMCA/IHJvdXRlWzBdLnNwZWVkIDogZGVmYXVsdFNwZWVkO1xuXG4gIHByb2plY3Rpb24uaGVhdEF0V2F5cG9pbnRzLnB1c2goaGVhdCk7XG5cbiAgZm9yIChsZXQgaSA9IDE7IGkgPCByb3V0ZS5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHRhcmdldFBvcyA9IHJvdXRlW2ldO1xuICAgIGNvbnN0IHRhcmdldFNwZWVkID0gdGFyZ2V0UG9zLnNwZWVkID4gMCA/IHRhcmdldFBvcy5zcGVlZCA6IGRlZmF1bHRTcGVlZDtcblxuICAgIC8vIENhbGN1bGF0ZSBkaXN0YW5jZSBhbmQgdGltZVxuICAgIGNvbnN0IGR4ID0gdGFyZ2V0UG9zLnggLSBwb3MueDtcbiAgICBjb25zdCBkeSA9IHRhcmdldFBvcy55IC0gcG9zLnk7XG4gICAgY29uc3QgZGlzdGFuY2UgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuXG4gICAgaWYgKGRpc3RhbmNlIDwgMC4wMDEpIHtcbiAgICAgIHByb2plY3Rpb24uaGVhdEF0V2F5cG9pbnRzLnB1c2goaGVhdCk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyBBdmVyYWdlIHNwZWVkIGR1cmluZyBzZWdtZW50XG4gICAgY29uc3QgYXZnU3BlZWQgPSAoY3VycmVudFNwZWVkICsgdGFyZ2V0U3BlZWQpICogMC41O1xuICAgIGNvbnN0IHNlZ21lbnRUaW1lID0gZGlzdGFuY2UgLyBNYXRoLm1heChhdmdTcGVlZCwgMSk7XG5cbiAgICAvLyBDYWxjdWxhdGUgaGVhdCByYXRlIChtYXRjaCBzZXJ2ZXIgZm9ybXVsYSlcbiAgICBjb25zdCBWbiA9IE1hdGgubWF4KGhlYXRQYXJhbXMubWFya2VyU3BlZWQsIDAuMDAwMDAxKTtcbiAgICBjb25zdCBkZXYgPSBhdmdTcGVlZCAtIGhlYXRQYXJhbXMubWFya2VyU3BlZWQ7XG4gICAgY29uc3QgcCA9IGhlYXRQYXJhbXMuZXhwO1xuXG4gICAgbGV0IGhkb3Q6IG51bWJlcjtcbiAgICBpZiAoZGV2ID49IDApIHtcbiAgICAgIC8vIEhlYXRpbmdcbiAgICAgIGhkb3QgPSBoZWF0UGFyYW1zLmtVcCAqIE1hdGgucG93KGRldiAvIFZuLCBwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ29vbGluZ1xuICAgICAgaGRvdCA9IC1oZWF0UGFyYW1zLmtEb3duICogTWF0aC5wb3coTWF0aC5hYnMoZGV2KSAvIFZuLCBwKTtcbiAgICB9XG5cbiAgICAvLyBVcGRhdGUgaGVhdFxuICAgIGhlYXQgKz0gaGRvdCAqIHNlZ21lbnRUaW1lO1xuICAgIGhlYXQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihoZWF0LCBoZWF0UGFyYW1zLm1heCkpO1xuXG4gICAgcHJvamVjdGlvbi5oZWF0QXRXYXlwb2ludHMucHVzaChoZWF0KTtcbiAgICBwb3MgPSB7IHg6IHRhcmdldFBvcy54LCB5OiB0YXJnZXRQb3MueSB9O1xuICAgIGN1cnJlbnRTcGVlZCA9IHRhcmdldFNwZWVkO1xuXG4gICAgLy8gQ2hlY2sgZm9yIG92ZXJoZWF0XG4gICAgaWYgKGhlYXQgPj0gaGVhdFBhcmFtcy5vdmVyaGVhdEF0ICYmICFwcm9qZWN0aW9uLndpbGxPdmVyaGVhdCkge1xuICAgICAgcHJvamVjdGlvbi53aWxsT3ZlcmhlYXQgPSB0cnVlO1xuICAgICAgcHJvamVjdGlvbi5vdmVyaGVhdEF0ID0gaTtcbiAgICB9XG5cbiAgICAvLyBVcGRhdGUgcG9zaXRpb24gYW5kIHNwZWVkXG4gICAgcG9zID0gdGFyZ2V0UG9zO1xuICAgIGN1cnJlbnRTcGVlZCA9IHRhcmdldFNwZWVkO1xuICB9XG5cbiAgcmV0dXJuIHByb2plY3Rpb247XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVNaXNzaWxlTGltaXRzKHN0YXRlOiBBcHBTdGF0ZSwgbGltaXRzOiBQYXJ0aWFsPE1pc3NpbGVMaW1pdHM+KTogdm9pZCB7XG4gIHN0YXRlLm1pc3NpbGVMaW1pdHMgPSB7XG4gICAgc3BlZWRNaW46IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNaW4pID8gbGltaXRzLnNwZWVkTWluISA6IHN0YXRlLm1pc3NpbGVMaW1pdHMuc3BlZWRNaW4sXG4gICAgc3BlZWRNYXg6IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNYXgpID8gbGltaXRzLnNwZWVkTWF4ISA6IHN0YXRlLm1pc3NpbGVMaW1pdHMuc3BlZWRNYXgsXG4gICAgYWdyb01pbjogTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5hZ3JvTWluKSA/IGxpbWl0cy5hZ3JvTWluISA6IHN0YXRlLm1pc3NpbGVMaW1pdHMuYWdyb01pbixcbiAgfTtcbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuZXhwb3J0IHt9O1xuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4vKipcbiAqIERldGVybWluZSB3aGV0aGVyIHRoZSBnaXZlbiBgYXJnYCBpcyBhIG1lc3NhZ2UuXG4gKiBJZiBgZGVzY2AgaXMgc2V0LCBkZXRlcm1pbmUgd2hldGhlciBgYXJnYCBpcyB0aGlzIHNwZWNpZmljIG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc01lc3NhZ2UoYXJnLCBzY2hlbWEpIHtcbiAgICBjb25zdCBpc01lc3NhZ2UgPSBhcmcgIT09IG51bGwgJiZcbiAgICAgICAgdHlwZW9mIGFyZyA9PSBcIm9iamVjdFwiICYmXG4gICAgICAgIFwiJHR5cGVOYW1lXCIgaW4gYXJnICYmXG4gICAgICAgIHR5cGVvZiBhcmcuJHR5cGVOYW1lID09IFwic3RyaW5nXCI7XG4gICAgaWYgKCFpc01lc3NhZ2UpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBzY2hlbWEudHlwZU5hbWUgPT09IGFyZy4kdHlwZU5hbWU7XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbi8qKlxuICogU2NhbGFyIHZhbHVlIHR5cGVzLiBUaGlzIGlzIGEgc3Vic2V0IG9mIGZpZWxkIHR5cGVzIGRlY2xhcmVkIGJ5IHByb3RvYnVmXG4gKiBlbnVtIGdvb2dsZS5wcm90b2J1Zi5GaWVsZERlc2NyaXB0b3JQcm90by5UeXBlIFRoZSB0eXBlcyBHUk9VUCBhbmQgTUVTU0FHRVxuICogYXJlIG9taXR0ZWQsIGJ1dCB0aGUgbnVtZXJpY2FsIHZhbHVlcyBhcmUgaWRlbnRpY2FsLlxuICovXG5leHBvcnQgdmFyIFNjYWxhclR5cGU7XG4oZnVuY3Rpb24gKFNjYWxhclR5cGUpIHtcbiAgICAvLyAwIGlzIHJlc2VydmVkIGZvciBlcnJvcnMuXG4gICAgLy8gT3JkZXIgaXMgd2VpcmQgZm9yIGhpc3RvcmljYWwgcmVhc29ucy5cbiAgICBTY2FsYXJUeXBlW1NjYWxhclR5cGVbXCJET1VCTEVcIl0gPSAxXSA9IFwiRE9VQkxFXCI7XG4gICAgU2NhbGFyVHlwZVtTY2FsYXJUeXBlW1wiRkxPQVRcIl0gPSAyXSA9IFwiRkxPQVRcIjtcbiAgICAvLyBOb3QgWmlnWmFnIGVuY29kZWQuICBOZWdhdGl2ZSBudW1iZXJzIHRha2UgMTAgYnl0ZXMuICBVc2UgVFlQRV9TSU5UNjQgaWZcbiAgICAvLyBuZWdhdGl2ZSB2YWx1ZXMgYXJlIGxpa2VseS5cbiAgICBTY2FsYXJUeXBlW1NjYWxhclR5cGVbXCJJTlQ2NFwiXSA9IDNdID0gXCJJTlQ2NFwiO1xuICAgIFNjYWxhclR5cGVbU2NhbGFyVHlwZVtcIlVJTlQ2NFwiXSA9IDRdID0gXCJVSU5UNjRcIjtcbiAgICAvLyBOb3QgWmlnWmFnIGVuY29kZWQuICBOZWdhdGl2ZSBudW1iZXJzIHRha2UgMTAgYnl0ZXMuICBVc2UgVFlQRV9TSU5UMzIgaWZcbiAgICAvLyBuZWdhdGl2ZSB2YWx1ZXMgYXJlIGxpa2VseS5cbiAgICBTY2FsYXJUeXBlW1NjYWxhclR5cGVbXCJJTlQzMlwiXSA9IDVdID0gXCJJTlQzMlwiO1xuICAgIFNjYWxhclR5cGVbU2NhbGFyVHlwZVtcIkZJWEVENjRcIl0gPSA2XSA9IFwiRklYRUQ2NFwiO1xuICAgIFNjYWxhclR5cGVbU2NhbGFyVHlwZVtcIkZJWEVEMzJcIl0gPSA3XSA9IFwiRklYRUQzMlwiO1xuICAgIFNjYWxhclR5cGVbU2NhbGFyVHlwZVtcIkJPT0xcIl0gPSA4XSA9IFwiQk9PTFwiO1xuICAgIFNjYWxhclR5cGVbU2NhbGFyVHlwZVtcIlNUUklOR1wiXSA9IDldID0gXCJTVFJJTkdcIjtcbiAgICAvLyBUYWctZGVsaW1pdGVkIGFnZ3JlZ2F0ZS5cbiAgICAvLyBHcm91cCB0eXBlIGlzIGRlcHJlY2F0ZWQgYW5kIG5vdCBzdXBwb3J0ZWQgaW4gcHJvdG8zLiBIb3dldmVyLCBQcm90bzNcbiAgICAvLyBpbXBsZW1lbnRhdGlvbnMgc2hvdWxkIHN0aWxsIGJlIGFibGUgdG8gcGFyc2UgdGhlIGdyb3VwIHdpcmUgZm9ybWF0IGFuZFxuICAgIC8vIHRyZWF0IGdyb3VwIGZpZWxkcyBhcyB1bmtub3duIGZpZWxkcy5cbiAgICAvLyBUWVBFX0dST1VQID0gMTAsXG4gICAgLy8gVFlQRV9NRVNTQUdFID0gMTEsICAvLyBMZW5ndGgtZGVsaW1pdGVkIGFnZ3JlZ2F0ZS5cbiAgICAvLyBOZXcgaW4gdmVyc2lvbiAyLlxuICAgIFNjYWxhclR5cGVbU2NhbGFyVHlwZVtcIkJZVEVTXCJdID0gMTJdID0gXCJCWVRFU1wiO1xuICAgIFNjYWxhclR5cGVbU2NhbGFyVHlwZVtcIlVJTlQzMlwiXSA9IDEzXSA9IFwiVUlOVDMyXCI7XG4gICAgLy8gVFlQRV9FTlVNID0gMTQsXG4gICAgU2NhbGFyVHlwZVtTY2FsYXJUeXBlW1wiU0ZJWEVEMzJcIl0gPSAxNV0gPSBcIlNGSVhFRDMyXCI7XG4gICAgU2NhbGFyVHlwZVtTY2FsYXJUeXBlW1wiU0ZJWEVENjRcIl0gPSAxNl0gPSBcIlNGSVhFRDY0XCI7XG4gICAgU2NhbGFyVHlwZVtTY2FsYXJUeXBlW1wiU0lOVDMyXCJdID0gMTddID0gXCJTSU5UMzJcIjtcbiAgICBTY2FsYXJUeXBlW1NjYWxhclR5cGVbXCJTSU5UNjRcIl0gPSAxOF0gPSBcIlNJTlQ2NFwiO1xufSkoU2NhbGFyVHlwZSB8fCAoU2NhbGFyVHlwZSA9IHt9KSk7XG4iLCAiLy8gQ29weXJpZ2h0IDIwMDggR29vZ2xlIEluYy4gIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4vL1xuLy8gUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4vLyBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlXG4vLyBtZXQ6XG4vL1xuLy8gKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodFxuLy8gbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuLy8gKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlXG4vLyBjb3B5cmlnaHQgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyXG4vLyBpbiB0aGUgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlXG4vLyBkaXN0cmlidXRpb24uXG4vLyAqIE5laXRoZXIgdGhlIG5hbWUgb2YgR29vZ2xlIEluYy4gbm9yIHRoZSBuYW1lcyBvZiBpdHNcbi8vIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHMgZGVyaXZlZCBmcm9tXG4vLyB0aGlzIHNvZnR3YXJlIHdpdGhvdXQgc3BlY2lmaWMgcHJpb3Igd3JpdHRlbiBwZXJtaXNzaW9uLlxuLy9cbi8vIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlNcbi8vIFwiQVMgSVNcIiBBTkQgQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1Rcbi8vIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUlxuLy8gQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBDT1BZUklHSFRcbi8vIE9XTkVSIE9SIENPTlRSSUJVVE9SUyBCRSBMSUFCTEUgRk9SIEFOWSBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLFxuLy8gU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVMgKElOQ0xVRElORywgQlVUIE5PVFxuLy8gTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUzsgTE9TUyBPRiBVU0UsXG4vLyBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORCBPTiBBTllcbi8vIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbi8vIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRVxuLy8gT0YgVEhJUyBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbi8vXG4vLyBDb2RlIGdlbmVyYXRlZCBieSB0aGUgUHJvdG9jb2wgQnVmZmVyIGNvbXBpbGVyIGlzIG93bmVkIGJ5IHRoZSBvd25lclxuLy8gb2YgdGhlIGlucHV0IGZpbGUgdXNlZCB3aGVuIGdlbmVyYXRpbmcgaXQuICBUaGlzIGNvZGUgaXMgbm90XG4vLyBzdGFuZGFsb25lIGFuZCByZXF1aXJlcyBhIHN1cHBvcnQgbGlicmFyeSB0byBiZSBsaW5rZWQgd2l0aCBpdC4gIFRoaXNcbi8vIHN1cHBvcnQgbGlicmFyeSBpcyBpdHNlbGYgY292ZXJlZCBieSB0aGUgYWJvdmUgbGljZW5zZS5cbi8qKlxuICogUmVhZCBhIDY0IGJpdCB2YXJpbnQgYXMgdHdvIEpTIG51bWJlcnMuXG4gKlxuICogUmV0dXJucyB0dXBsZTpcbiAqIFswXTogbG93IGJpdHNcbiAqIFsxXTogaGlnaCBiaXRzXG4gKlxuICogQ29weXJpZ2h0IDIwMDggR29vZ2xlIEluYy4gIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9wcm90b2NvbGJ1ZmZlcnMvcHJvdG9idWYvYmxvYi84YTcxOTI3ZDc0YTRjZTM0ZWZlMmQ4NzY5ZmRhMTk4ZjUyZDIwZDEyL2pzL2V4cGVyaW1lbnRhbC9ydW50aW1lL2tlcm5lbC9idWZmZXJfZGVjb2Rlci5qcyNMMTc1XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB2YXJpbnQ2NHJlYWQoKSB7XG4gICAgbGV0IGxvd0JpdHMgPSAwO1xuICAgIGxldCBoaWdoQml0cyA9IDA7XG4gICAgZm9yIChsZXQgc2hpZnQgPSAwOyBzaGlmdCA8IDI4OyBzaGlmdCArPSA3KSB7XG4gICAgICAgIGxldCBiID0gdGhpcy5idWZbdGhpcy5wb3MrK107XG4gICAgICAgIGxvd0JpdHMgfD0gKGIgJiAweDdmKSA8PCBzaGlmdDtcbiAgICAgICAgaWYgKChiICYgMHg4MCkgPT0gMCkge1xuICAgICAgICAgICAgdGhpcy5hc3NlcnRCb3VuZHMoKTtcbiAgICAgICAgICAgIHJldHVybiBbbG93Qml0cywgaGlnaEJpdHNdO1xuICAgICAgICB9XG4gICAgfVxuICAgIGxldCBtaWRkbGVCeXRlID0gdGhpcy5idWZbdGhpcy5wb3MrK107XG4gICAgLy8gbGFzdCBmb3VyIGJpdHMgb2YgdGhlIGZpcnN0IDMyIGJpdCBudW1iZXJcbiAgICBsb3dCaXRzIHw9IChtaWRkbGVCeXRlICYgMHgwZikgPDwgMjg7XG4gICAgLy8gMyB1cHBlciBiaXRzIGFyZSBwYXJ0IG9mIHRoZSBuZXh0IDMyIGJpdCBudW1iZXJcbiAgICBoaWdoQml0cyA9IChtaWRkbGVCeXRlICYgMHg3MCkgPj4gNDtcbiAgICBpZiAoKG1pZGRsZUJ5dGUgJiAweDgwKSA9PSAwKSB7XG4gICAgICAgIHRoaXMuYXNzZXJ0Qm91bmRzKCk7XG4gICAgICAgIHJldHVybiBbbG93Qml0cywgaGlnaEJpdHNdO1xuICAgIH1cbiAgICBmb3IgKGxldCBzaGlmdCA9IDM7IHNoaWZ0IDw9IDMxOyBzaGlmdCArPSA3KSB7XG4gICAgICAgIGxldCBiID0gdGhpcy5idWZbdGhpcy5wb3MrK107XG4gICAgICAgIGhpZ2hCaXRzIHw9IChiICYgMHg3ZikgPDwgc2hpZnQ7XG4gICAgICAgIGlmICgoYiAmIDB4ODApID09IDApIHtcbiAgICAgICAgICAgIHRoaXMuYXNzZXJ0Qm91bmRzKCk7XG4gICAgICAgICAgICByZXR1cm4gW2xvd0JpdHMsIGhpZ2hCaXRzXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbnZhbGlkIHZhcmludFwiKTtcbn1cbi8qKlxuICogV3JpdGUgYSA2NCBiaXQgdmFyaW50LCBnaXZlbiBhcyB0d28gSlMgbnVtYmVycywgdG8gdGhlIGdpdmVuIGJ5dGVzIGFycmF5LlxuICpcbiAqIENvcHlyaWdodCAyMDA4IEdvb2dsZSBJbmMuICBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICpcbiAqIFNlZSBodHRwczovL2dpdGh1Yi5jb20vcHJvdG9jb2xidWZmZXJzL3Byb3RvYnVmL2Jsb2IvOGE3MTkyN2Q3NGE0Y2UzNGVmZTJkODc2OWZkYTE5OGY1MmQyMGQxMi9qcy9leHBlcmltZW50YWwvcnVudGltZS9rZXJuZWwvd3JpdGVyLmpzI0wzNDRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhcmludDY0d3JpdGUobG8sIGhpLCBieXRlcykge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgMjg7IGkgPSBpICsgNykge1xuICAgICAgICBjb25zdCBzaGlmdCA9IGxvID4+PiBpO1xuICAgICAgICBjb25zdCBoYXNOZXh0ID0gIShzaGlmdCA+Pj4gNyA9PSAwICYmIGhpID09IDApO1xuICAgICAgICBjb25zdCBieXRlID0gKGhhc05leHQgPyBzaGlmdCB8IDB4ODAgOiBzaGlmdCkgJiAweGZmO1xuICAgICAgICBieXRlcy5wdXNoKGJ5dGUpO1xuICAgICAgICBpZiAoIWhhc05leHQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBzcGxpdEJpdHMgPSAoKGxvID4+PiAyOCkgJiAweDBmKSB8ICgoaGkgJiAweDA3KSA8PCA0KTtcbiAgICBjb25zdCBoYXNNb3JlQml0cyA9ICEoaGkgPj4gMyA9PSAwKTtcbiAgICBieXRlcy5wdXNoKChoYXNNb3JlQml0cyA/IHNwbGl0Qml0cyB8IDB4ODAgOiBzcGxpdEJpdHMpICYgMHhmZik7XG4gICAgaWYgKCFoYXNNb3JlQml0cykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGZvciAobGV0IGkgPSAzOyBpIDwgMzE7IGkgPSBpICsgNykge1xuICAgICAgICBjb25zdCBzaGlmdCA9IGhpID4+PiBpO1xuICAgICAgICBjb25zdCBoYXNOZXh0ID0gIShzaGlmdCA+Pj4gNyA9PSAwKTtcbiAgICAgICAgY29uc3QgYnl0ZSA9IChoYXNOZXh0ID8gc2hpZnQgfCAweDgwIDogc2hpZnQpICYgMHhmZjtcbiAgICAgICAgYnl0ZXMucHVzaChieXRlKTtcbiAgICAgICAgaWYgKCFoYXNOZXh0KSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICB9XG4gICAgYnl0ZXMucHVzaCgoaGkgPj4+IDMxKSAmIDB4MDEpO1xufVxuLy8gY29uc3RhbnRzIGZvciBiaW5hcnkgbWF0aFxuY29uc3QgVFdPX1BXUl8zMl9EQkwgPSAweDEwMDAwMDAwMDtcbi8qKlxuICogUGFyc2UgZGVjaW1hbCBzdHJpbmcgb2YgNjQgYml0IGludGVnZXIgdmFsdWUgYXMgdHdvIEpTIG51bWJlcnMuXG4gKlxuICogQ29weXJpZ2h0IDIwMDggR29vZ2xlIEluYy4gIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9wcm90b2NvbGJ1ZmZlcnMvcHJvdG9idWYtamF2YXNjcmlwdC9ibG9iL2E0MjhjNTgyNzNhYmFkMDdjNjYwNzFkOTc1M2JjNGQxMjg5ZGU0MjYvZXhwZXJpbWVudGFsL3J1bnRpbWUvaW50NjQuanMjTDEwXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbnQ2NEZyb21TdHJpbmcoZGVjKSB7XG4gICAgLy8gQ2hlY2sgZm9yIG1pbnVzIHNpZ24uXG4gICAgY29uc3QgbWludXMgPSBkZWNbMF0gPT09IFwiLVwiO1xuICAgIGlmIChtaW51cykge1xuICAgICAgICBkZWMgPSBkZWMuc2xpY2UoMSk7XG4gICAgfVxuICAgIC8vIFdvcmsgNiBkZWNpbWFsIGRpZ2l0cyBhdCBhIHRpbWUsIGFjdGluZyBsaWtlIHdlJ3JlIGNvbnZlcnRpbmcgYmFzZSAxZTZcbiAgICAvLyBkaWdpdHMgdG8gYmluYXJ5LiBUaGlzIGlzIHNhZmUgdG8gZG8gd2l0aCBmbG9hdGluZyBwb2ludCBtYXRoIGJlY2F1c2VcbiAgICAvLyBOdW1iZXIuaXNTYWZlSW50ZWdlcihBTExfMzJfQklUUyAqIDFlNikgPT0gdHJ1ZS5cbiAgICBjb25zdCBiYXNlID0gMWU2O1xuICAgIGxldCBsb3dCaXRzID0gMDtcbiAgICBsZXQgaGlnaEJpdHMgPSAwO1xuICAgIGZ1bmN0aW9uIGFkZDFlNmRpZ2l0KGJlZ2luLCBlbmQpIHtcbiAgICAgICAgLy8gTm90ZTogTnVtYmVyKCcnKSBpcyAwLlxuICAgICAgICBjb25zdCBkaWdpdDFlNiA9IE51bWJlcihkZWMuc2xpY2UoYmVnaW4sIGVuZCkpO1xuICAgICAgICBoaWdoQml0cyAqPSBiYXNlO1xuICAgICAgICBsb3dCaXRzID0gbG93Qml0cyAqIGJhc2UgKyBkaWdpdDFlNjtcbiAgICAgICAgLy8gQ2FycnkgYml0cyBmcm9tIGxvd0JpdHMgdG9cbiAgICAgICAgaWYgKGxvd0JpdHMgPj0gVFdPX1BXUl8zMl9EQkwpIHtcbiAgICAgICAgICAgIGhpZ2hCaXRzID0gaGlnaEJpdHMgKyAoKGxvd0JpdHMgLyBUV09fUFdSXzMyX0RCTCkgfCAwKTtcbiAgICAgICAgICAgIGxvd0JpdHMgPSBsb3dCaXRzICUgVFdPX1BXUl8zMl9EQkw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgYWRkMWU2ZGlnaXQoLTI0LCAtMTgpO1xuICAgIGFkZDFlNmRpZ2l0KC0xOCwgLTEyKTtcbiAgICBhZGQxZTZkaWdpdCgtMTIsIC02KTtcbiAgICBhZGQxZTZkaWdpdCgtNik7XG4gICAgcmV0dXJuIG1pbnVzID8gbmVnYXRlKGxvd0JpdHMsIGhpZ2hCaXRzKSA6IG5ld0JpdHMobG93Qml0cywgaGlnaEJpdHMpO1xufVxuLyoqXG4gKiBMb3NzbGVzc2x5IGNvbnZlcnRzIGEgNjQtYml0IHNpZ25lZCBpbnRlZ2VyIGluIDMyOjMyIHNwbGl0IHJlcHJlc2VudGF0aW9uXG4gKiBpbnRvIGEgZGVjaW1hbCBzdHJpbmcuXG4gKlxuICogQ29weXJpZ2h0IDIwMDggR29vZ2xlIEluYy4gIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9wcm90b2NvbGJ1ZmZlcnMvcHJvdG9idWYtamF2YXNjcmlwdC9ibG9iL2E0MjhjNTgyNzNhYmFkMDdjNjYwNzFkOTc1M2JjNGQxMjg5ZGU0MjYvZXhwZXJpbWVudGFsL3J1bnRpbWUvaW50NjQuanMjTDEwXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbnQ2NFRvU3RyaW5nKGxvLCBoaSkge1xuICAgIGxldCBiaXRzID0gbmV3Qml0cyhsbywgaGkpO1xuICAgIC8vIElmIHdlJ3JlIHRyZWF0aW5nIHRoZSBpbnB1dCBhcyBhIHNpZ25lZCB2YWx1ZSBhbmQgdGhlIGhpZ2ggYml0IGlzIHNldCwgZG9cbiAgICAvLyBhIG1hbnVhbCB0d28ncyBjb21wbGVtZW50IGNvbnZlcnNpb24gYmVmb3JlIHRoZSBkZWNpbWFsIGNvbnZlcnNpb24uXG4gICAgY29uc3QgbmVnYXRpdmUgPSBiaXRzLmhpICYgMHg4MDAwMDAwMDtcbiAgICBpZiAobmVnYXRpdmUpIHtcbiAgICAgICAgYml0cyA9IG5lZ2F0ZShiaXRzLmxvLCBiaXRzLmhpKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gdUludDY0VG9TdHJpbmcoYml0cy5sbywgYml0cy5oaSk7XG4gICAgcmV0dXJuIG5lZ2F0aXZlID8gXCItXCIgKyByZXN1bHQgOiByZXN1bHQ7XG59XG4vKipcbiAqIExvc3NsZXNzbHkgY29udmVydHMgYSA2NC1iaXQgdW5zaWduZWQgaW50ZWdlciBpbiAzMjozMiBzcGxpdCByZXByZXNlbnRhdGlvblxuICogaW50byBhIGRlY2ltYWwgc3RyaW5nLlxuICpcbiAqIENvcHlyaWdodCAyMDA4IEdvb2dsZSBJbmMuICBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICpcbiAqIFNlZSBodHRwczovL2dpdGh1Yi5jb20vcHJvdG9jb2xidWZmZXJzL3Byb3RvYnVmLWphdmFzY3JpcHQvYmxvYi9hNDI4YzU4MjczYWJhZDA3YzY2MDcxZDk3NTNiYzRkMTI4OWRlNDI2L2V4cGVyaW1lbnRhbC9ydW50aW1lL2ludDY0LmpzI0wxMFxuICovXG5leHBvcnQgZnVuY3Rpb24gdUludDY0VG9TdHJpbmcobG8sIGhpKSB7XG4gICAgKHsgbG8sIGhpIH0gPSB0b1Vuc2lnbmVkKGxvLCBoaSkpO1xuICAgIC8vIFNraXAgdGhlIGV4cGVuc2l2ZSBjb252ZXJzaW9uIGlmIHRoZSBudW1iZXIgaXMgc21hbGwgZW5vdWdoIHRvIHVzZSB0aGVcbiAgICAvLyBidWlsdC1pbiBjb252ZXJzaW9ucy5cbiAgICAvLyBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiA9IDB4MDAxRkZGRkYgRkZGRkZGRkYsIHRodXMgYW55IG51bWJlciB3aXRoXG4gICAgLy8gaGlnaEJpdHMgPD0gMHgxRkZGRkYgY2FuIGJlIHNhZmVseSBleHByZXNzZWQgd2l0aCBhIGRvdWJsZSBhbmQgcmV0YWluXG4gICAgLy8gaW50ZWdlciBwcmVjaXNpb24uXG4gICAgLy8gUHJvdmVuIGJ5OiBOdW1iZXIuaXNTYWZlSW50ZWdlcigweDFGRkZGRiAqIDIqKjMyICsgMHhGRkZGRkZGRikgPT0gdHJ1ZS5cbiAgICBpZiAoaGkgPD0gMHgxZmZmZmYpIHtcbiAgICAgICAgcmV0dXJuIFN0cmluZyhUV09fUFdSXzMyX0RCTCAqIGhpICsgbG8pO1xuICAgIH1cbiAgICAvLyBXaGF0IHRoaXMgY29kZSBpcyBkb2luZyBpcyBlc3NlbnRpYWxseSBjb252ZXJ0aW5nIHRoZSBpbnB1dCBudW1iZXIgZnJvbVxuICAgIC8vIGJhc2UtMiB0byBiYXNlLTFlNywgd2hpY2ggYWxsb3dzIHVzIHRvIHJlcHJlc2VudCB0aGUgNjQtYml0IHJhbmdlIHdpdGhcbiAgICAvLyBvbmx5IDMgKHZlcnkgbGFyZ2UpIGRpZ2l0cy4gVGhvc2UgZGlnaXRzIGFyZSB0aGVuIHRyaXZpYWwgdG8gY29udmVydCB0b1xuICAgIC8vIGEgYmFzZS0xMCBzdHJpbmcuXG4gICAgLy8gVGhlIG1hZ2ljIG51bWJlcnMgdXNlZCBoZXJlIGFyZSAtXG4gICAgLy8gMl4yNCA9IDE2Nzc3MjE2ID0gKDEsNjc3NzIxNikgaW4gYmFzZS0xZTcuXG4gICAgLy8gMl40OCA9IDI4MTQ3NDk3NjcxMDY1NiA9ICgyLDgxNDc0OTcsNjcxMDY1NikgaW4gYmFzZS0xZTcuXG4gICAgLy8gU3BsaXQgMzI6MzIgcmVwcmVzZW50YXRpb24gaW50byAxNjoyNDoyNCByZXByZXNlbnRhdGlvbiBzbyBvdXJcbiAgICAvLyBpbnRlcm1lZGlhdGUgZGlnaXRzIGRvbid0IG92ZXJmbG93LlxuICAgIGNvbnN0IGxvdyA9IGxvICYgMHhmZmZmZmY7XG4gICAgY29uc3QgbWlkID0gKChsbyA+Pj4gMjQpIHwgKGhpIDw8IDgpKSAmIDB4ZmZmZmZmO1xuICAgIGNvbnN0IGhpZ2ggPSAoaGkgPj4gMTYpICYgMHhmZmZmO1xuICAgIC8vIEFzc2VtYmxlIG91ciB0aHJlZSBiYXNlLTFlNyBkaWdpdHMsIGlnbm9yaW5nIGNhcnJpZXMuIFRoZSBtYXhpbXVtXG4gICAgLy8gdmFsdWUgaW4gYSBkaWdpdCBhdCB0aGlzIHN0ZXAgaXMgcmVwcmVzZW50YWJsZSBhcyBhIDQ4LWJpdCBpbnRlZ2VyLCB3aGljaFxuICAgIC8vIGNhbiBiZSBzdG9yZWQgaW4gYSA2NC1iaXQgZmxvYXRpbmcgcG9pbnQgbnVtYmVyLlxuICAgIGxldCBkaWdpdEEgPSBsb3cgKyBtaWQgKiA2Nzc3MjE2ICsgaGlnaCAqIDY3MTA2NTY7XG4gICAgbGV0IGRpZ2l0QiA9IG1pZCArIGhpZ2ggKiA4MTQ3NDk3O1xuICAgIGxldCBkaWdpdEMgPSBoaWdoICogMjtcbiAgICAvLyBBcHBseSBjYXJyaWVzIGZyb20gQSB0byBCIGFuZCBmcm9tIEIgdG8gQy5cbiAgICBjb25zdCBiYXNlID0gMTAwMDAwMDA7XG4gICAgaWYgKGRpZ2l0QSA+PSBiYXNlKSB7XG4gICAgICAgIGRpZ2l0QiArPSBNYXRoLmZsb29yKGRpZ2l0QSAvIGJhc2UpO1xuICAgICAgICBkaWdpdEEgJT0gYmFzZTtcbiAgICB9XG4gICAgaWYgKGRpZ2l0QiA+PSBiYXNlKSB7XG4gICAgICAgIGRpZ2l0QyArPSBNYXRoLmZsb29yKGRpZ2l0QiAvIGJhc2UpO1xuICAgICAgICBkaWdpdEIgJT0gYmFzZTtcbiAgICB9XG4gICAgLy8gSWYgZGlnaXRDIGlzIDAsIHRoZW4gd2Ugc2hvdWxkIGhhdmUgcmV0dXJuZWQgaW4gdGhlIHRyaXZpYWwgY29kZSBwYXRoXG4gICAgLy8gYXQgdGhlIHRvcCBmb3Igbm9uLXNhZmUgaW50ZWdlcnMuIEdpdmVuIHRoaXMsIHdlIGNhbiBhc3N1bWUgYm90aCBkaWdpdEJcbiAgICAvLyBhbmQgZGlnaXRBIG5lZWQgbGVhZGluZyB6ZXJvcy5cbiAgICByZXR1cm4gKGRpZ2l0Qy50b1N0cmluZygpICtcbiAgICAgICAgZGVjaW1hbEZyb20xZTdXaXRoTGVhZGluZ1plcm9zKGRpZ2l0QikgK1xuICAgICAgICBkZWNpbWFsRnJvbTFlN1dpdGhMZWFkaW5nWmVyb3MoZGlnaXRBKSk7XG59XG5mdW5jdGlvbiB0b1Vuc2lnbmVkKGxvLCBoaSkge1xuICAgIHJldHVybiB7IGxvOiBsbyA+Pj4gMCwgaGk6IGhpID4+PiAwIH07XG59XG5mdW5jdGlvbiBuZXdCaXRzKGxvLCBoaSkge1xuICAgIHJldHVybiB7IGxvOiBsbyB8IDAsIGhpOiBoaSB8IDAgfTtcbn1cbi8qKlxuICogUmV0dXJucyB0d28ncyBjb21wbGltZW50IG5lZ2F0aW9uIG9mIGlucHV0LlxuICogQHNlZSBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9PcGVyYXRvcnMvQml0d2lzZV9PcGVyYXRvcnMjU2lnbmVkXzMyLWJpdF9pbnRlZ2Vyc1xuICovXG5mdW5jdGlvbiBuZWdhdGUobG93Qml0cywgaGlnaEJpdHMpIHtcbiAgICBoaWdoQml0cyA9IH5oaWdoQml0cztcbiAgICBpZiAobG93Qml0cykge1xuICAgICAgICBsb3dCaXRzID0gfmxvd0JpdHMgKyAxO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgLy8gSWYgbG93Qml0cyBpcyAwLCB0aGVuIGJpdHdpc2Utbm90IGlzIDB4RkZGRkZGRkYsXG4gICAgICAgIC8vIGFkZGluZyAxIHRvIHRoYXQsIHJlc3VsdHMgaW4gMHgxMDAwMDAwMDAsIHdoaWNoIGxlYXZlc1xuICAgICAgICAvLyB0aGUgbG93IGJpdHMgMHgwIGFuZCBzaW1wbHkgYWRkcyBvbmUgdG8gdGhlIGhpZ2ggYml0cy5cbiAgICAgICAgaGlnaEJpdHMgKz0gMTtcbiAgICB9XG4gICAgcmV0dXJuIG5ld0JpdHMobG93Qml0cywgaGlnaEJpdHMpO1xufVxuLyoqXG4gKiBSZXR1cm5zIGRlY2ltYWwgcmVwcmVzZW50YXRpb24gb2YgZGlnaXQxZTcgd2l0aCBsZWFkaW5nIHplcm9zLlxuICovXG5jb25zdCBkZWNpbWFsRnJvbTFlN1dpdGhMZWFkaW5nWmVyb3MgPSAoZGlnaXQxZTcpID0+IHtcbiAgICBjb25zdCBwYXJ0aWFsID0gU3RyaW5nKGRpZ2l0MWU3KTtcbiAgICByZXR1cm4gXCIwMDAwMDAwXCIuc2xpY2UocGFydGlhbC5sZW5ndGgpICsgcGFydGlhbDtcbn07XG4vKipcbiAqIFdyaXRlIGEgMzIgYml0IHZhcmludCwgc2lnbmVkIG9yIHVuc2lnbmVkLiBTYW1lIGFzIGB2YXJpbnQ2NHdyaXRlKDAsIHZhbHVlLCBieXRlcylgXG4gKlxuICogQ29weXJpZ2h0IDIwMDggR29vZ2xlIEluYy4gIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9wcm90b2NvbGJ1ZmZlcnMvcHJvdG9idWYvYmxvYi8xYjE4ODMzZjRmMmEyZjY4MWY0ZTRhMjVjZGYzYjBhNDMxMTVlYzI2L2pzL2JpbmFyeS9lbmNvZGVyLmpzI0wxNDRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhcmludDMyd3JpdGUodmFsdWUsIGJ5dGVzKSB7XG4gICAgaWYgKHZhbHVlID49IDApIHtcbiAgICAgICAgLy8gd3JpdGUgdmFsdWUgYXMgdmFyaW50IDMyXG4gICAgICAgIHdoaWxlICh2YWx1ZSA+IDB4N2YpIHtcbiAgICAgICAgICAgIGJ5dGVzLnB1c2goKHZhbHVlICYgMHg3ZikgfCAweDgwKTtcbiAgICAgICAgICAgIHZhbHVlID0gdmFsdWUgPj4+IDc7XG4gICAgICAgIH1cbiAgICAgICAgYnl0ZXMucHVzaCh2YWx1ZSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDk7IGkrKykge1xuICAgICAgICAgICAgYnl0ZXMucHVzaCgodmFsdWUgJiAxMjcpIHwgMTI4KTtcbiAgICAgICAgICAgIHZhbHVlID0gdmFsdWUgPj4gNztcbiAgICAgICAgfVxuICAgICAgICBieXRlcy5wdXNoKDEpO1xuICAgIH1cbn1cbi8qKlxuICogUmVhZCBhbiB1bnNpZ25lZCAzMiBiaXQgdmFyaW50LlxuICpcbiAqIFNlZSBodHRwczovL2dpdGh1Yi5jb20vcHJvdG9jb2xidWZmZXJzL3Byb3RvYnVmL2Jsb2IvOGE3MTkyN2Q3NGE0Y2UzNGVmZTJkODc2OWZkYTE5OGY1MmQyMGQxMi9qcy9leHBlcmltZW50YWwvcnVudGltZS9rZXJuZWwvYnVmZmVyX2RlY29kZXIuanMjTDIyMFxuICovXG5leHBvcnQgZnVuY3Rpb24gdmFyaW50MzJyZWFkKCkge1xuICAgIGxldCBiID0gdGhpcy5idWZbdGhpcy5wb3MrK107XG4gICAgbGV0IHJlc3VsdCA9IGIgJiAweDdmO1xuICAgIGlmICgoYiAmIDB4ODApID09IDApIHtcbiAgICAgICAgdGhpcy5hc3NlcnRCb3VuZHMoKTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgYiA9IHRoaXMuYnVmW3RoaXMucG9zKytdO1xuICAgIHJlc3VsdCB8PSAoYiAmIDB4N2YpIDw8IDc7XG4gICAgaWYgKChiICYgMHg4MCkgPT0gMCkge1xuICAgICAgICB0aGlzLmFzc2VydEJvdW5kcygpO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICBiID0gdGhpcy5idWZbdGhpcy5wb3MrK107XG4gICAgcmVzdWx0IHw9IChiICYgMHg3ZikgPDwgMTQ7XG4gICAgaWYgKChiICYgMHg4MCkgPT0gMCkge1xuICAgICAgICB0aGlzLmFzc2VydEJvdW5kcygpO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICBiID0gdGhpcy5idWZbdGhpcy5wb3MrK107XG4gICAgcmVzdWx0IHw9IChiICYgMHg3ZikgPDwgMjE7XG4gICAgaWYgKChiICYgMHg4MCkgPT0gMCkge1xuICAgICAgICB0aGlzLmFzc2VydEJvdW5kcygpO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICAvLyBFeHRyYWN0IG9ubHkgbGFzdCA0IGJpdHNcbiAgICBiID0gdGhpcy5idWZbdGhpcy5wb3MrK107XG4gICAgcmVzdWx0IHw9IChiICYgMHgwZikgPDwgMjg7XG4gICAgZm9yIChsZXQgcmVhZEJ5dGVzID0gNTsgKGIgJiAweDgwKSAhPT0gMCAmJiByZWFkQnl0ZXMgPCAxMDsgcmVhZEJ5dGVzKyspXG4gICAgICAgIGIgPSB0aGlzLmJ1Zlt0aGlzLnBvcysrXTtcbiAgICBpZiAoKGIgJiAweDgwKSAhPSAwKVxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbnZhbGlkIHZhcmludFwiKTtcbiAgICB0aGlzLmFzc2VydEJvdW5kcygpO1xuICAgIC8vIFJlc3VsdCBjYW4gaGF2ZSAzMiBiaXRzLCBjb252ZXJ0IGl0IHRvIHVuc2lnbmVkXG4gICAgcmV0dXJuIHJlc3VsdCA+Pj4gMDtcbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuaW1wb3J0IHsgaW50NjRGcm9tU3RyaW5nLCBpbnQ2NFRvU3RyaW5nLCB1SW50NjRUb1N0cmluZywgfSBmcm9tIFwiLi93aXJlL3ZhcmludC5qc1wiO1xuLyoqXG4gKiBJbnQ2NFN1cHBvcnQgZm9yIHRoZSBjdXJyZW50IGVudmlyb25tZW50LlxuICovXG5leHBvcnQgY29uc3QgcHJvdG9JbnQ2NCA9IC8qQF9fUFVSRV9fKi8gbWFrZUludDY0U3VwcG9ydCgpO1xuZnVuY3Rpb24gbWFrZUludDY0U3VwcG9ydCgpIHtcbiAgICBjb25zdCBkdiA9IG5ldyBEYXRhVmlldyhuZXcgQXJyYXlCdWZmZXIoOCkpO1xuICAgIC8vIG5vdGUgdGhhdCBTYWZhcmkgMTQgaW1wbGVtZW50cyBCaWdJbnQsIGJ1dCBub3QgdGhlIERhdGFWaWV3IG1ldGhvZHNcbiAgICBjb25zdCBvayA9IHR5cGVvZiBCaWdJbnQgPT09IFwiZnVuY3Rpb25cIiAmJlxuICAgICAgICB0eXBlb2YgZHYuZ2V0QmlnSW50NjQgPT09IFwiZnVuY3Rpb25cIiAmJlxuICAgICAgICB0eXBlb2YgZHYuZ2V0QmlnVWludDY0ID09PSBcImZ1bmN0aW9uXCIgJiZcbiAgICAgICAgdHlwZW9mIGR2LnNldEJpZ0ludDY0ID09PSBcImZ1bmN0aW9uXCIgJiZcbiAgICAgICAgdHlwZW9mIGR2LnNldEJpZ1VpbnQ2NCA9PT0gXCJmdW5jdGlvblwiICYmXG4gICAgICAgICghIWdsb2JhbFRoaXMuRGVubyB8fFxuICAgICAgICAgICAgdHlwZW9mIHByb2Nlc3MgIT0gXCJvYmplY3RcIiB8fFxuICAgICAgICAgICAgdHlwZW9mIHByb2Nlc3MuZW52ICE9IFwib2JqZWN0XCIgfHxcbiAgICAgICAgICAgIHByb2Nlc3MuZW52LkJVRl9CSUdJTlRfRElTQUJMRSAhPT0gXCIxXCIpO1xuICAgIGlmIChvaykge1xuICAgICAgICBjb25zdCBNSU4gPSBCaWdJbnQoXCItOTIyMzM3MjAzNjg1NDc3NTgwOFwiKTtcbiAgICAgICAgY29uc3QgTUFYID0gQmlnSW50KFwiOTIyMzM3MjAzNjg1NDc3NTgwN1wiKTtcbiAgICAgICAgY29uc3QgVU1JTiA9IEJpZ0ludChcIjBcIik7XG4gICAgICAgIGNvbnN0IFVNQVggPSBCaWdJbnQoXCIxODQ0Njc0NDA3MzcwOTU1MTYxNVwiKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHplcm86IEJpZ0ludCgwKSxcbiAgICAgICAgICAgIHN1cHBvcnRlZDogdHJ1ZSxcbiAgICAgICAgICAgIHBhcnNlKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYmkgPSB0eXBlb2YgdmFsdWUgPT0gXCJiaWdpbnRcIiA/IHZhbHVlIDogQmlnSW50KHZhbHVlKTtcbiAgICAgICAgICAgICAgICBpZiAoYmkgPiBNQVggfHwgYmkgPCBNSU4pIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBpbnZhbGlkIGludDY0OiAke3ZhbHVlfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gYmk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdVBhcnNlKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYmkgPSB0eXBlb2YgdmFsdWUgPT0gXCJiaWdpbnRcIiA/IHZhbHVlIDogQmlnSW50KHZhbHVlKTtcbiAgICAgICAgICAgICAgICBpZiAoYmkgPiBVTUFYIHx8IGJpIDwgVU1JTikge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGludmFsaWQgdWludDY0OiAke3ZhbHVlfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gYmk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZW5jKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgZHYuc2V0QmlnSW50NjQoMCwgdGhpcy5wYXJzZSh2YWx1ZSksIHRydWUpO1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIGxvOiBkdi5nZXRJbnQzMigwLCB0cnVlKSxcbiAgICAgICAgICAgICAgICAgICAgaGk6IGR2LmdldEludDMyKDQsIHRydWUpLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdUVuYyh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIGR2LnNldEJpZ0ludDY0KDAsIHRoaXMudVBhcnNlKHZhbHVlKSwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgbG86IGR2LmdldEludDMyKDAsIHRydWUpLFxuICAgICAgICAgICAgICAgICAgICBoaTogZHYuZ2V0SW50MzIoNCwgdHJ1ZSksXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBkZWMobG8sIGhpKSB7XG4gICAgICAgICAgICAgICAgZHYuc2V0SW50MzIoMCwgbG8sIHRydWUpO1xuICAgICAgICAgICAgICAgIGR2LnNldEludDMyKDQsIGhpLCB0cnVlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZHYuZ2V0QmlnSW50NjQoMCwgdHJ1ZSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdURlYyhsbywgaGkpIHtcbiAgICAgICAgICAgICAgICBkdi5zZXRJbnQzMigwLCBsbywgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgZHYuc2V0SW50MzIoNCwgaGksIHRydWUpO1xuICAgICAgICAgICAgICAgIHJldHVybiBkdi5nZXRCaWdVaW50NjQoMCwgdHJ1ZSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgICB6ZXJvOiBcIjBcIixcbiAgICAgICAgc3VwcG9ydGVkOiBmYWxzZSxcbiAgICAgICAgcGFyc2UodmFsdWUpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgIT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIHZhbHVlID0gdmFsdWUudG9TdHJpbmcoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGFzc2VydEludDY0U3RyaW5nKHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfSxcbiAgICAgICAgdVBhcnNlKHZhbHVlKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlICE9IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHZhbHVlLnRvU3RyaW5nKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhc3NlcnRVSW50NjRTdHJpbmcodmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICB9LFxuICAgICAgICBlbmModmFsdWUpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgIT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIHZhbHVlID0gdmFsdWUudG9TdHJpbmcoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGFzc2VydEludDY0U3RyaW5nKHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBpbnQ2NEZyb21TdHJpbmcodmFsdWUpO1xuICAgICAgICB9LFxuICAgICAgICB1RW5jKHZhbHVlKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlICE9IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHZhbHVlLnRvU3RyaW5nKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhc3NlcnRVSW50NjRTdHJpbmcodmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIGludDY0RnJvbVN0cmluZyh2YWx1ZSk7XG4gICAgICAgIH0sXG4gICAgICAgIGRlYyhsbywgaGkpIHtcbiAgICAgICAgICAgIHJldHVybiBpbnQ2NFRvU3RyaW5nKGxvLCBoaSk7XG4gICAgICAgIH0sXG4gICAgICAgIHVEZWMobG8sIGhpKSB7XG4gICAgICAgICAgICByZXR1cm4gdUludDY0VG9TdHJpbmcobG8sIGhpKTtcbiAgICAgICAgfSxcbiAgICB9O1xufVxuZnVuY3Rpb24gYXNzZXJ0SW50NjRTdHJpbmcodmFsdWUpIHtcbiAgICBpZiAoIS9eLT9bMC05XSskLy50ZXN0KHZhbHVlKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbnZhbGlkIGludDY0OiBcIiArIHZhbHVlKTtcbiAgICB9XG59XG5mdW5jdGlvbiBhc3NlcnRVSW50NjRTdHJpbmcodmFsdWUpIHtcbiAgICBpZiAoIS9eWzAtOV0rJC8udGVzdCh2YWx1ZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiaW52YWxpZCB1aW50NjQ6IFwiICsgdmFsdWUpO1xuICAgIH1cbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuaW1wb3J0IHsgcHJvdG9JbnQ2NCB9IGZyb20gXCIuLi9wcm90by1pbnQ2NC5qc1wiO1xuaW1wb3J0IHsgU2NhbGFyVHlwZSB9IGZyb20gXCIuLi9kZXNjcmlwdG9ycy5qc1wiO1xuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgYm90aCBzY2FsYXIgdmFsdWVzIGFyZSBlcXVhbC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNjYWxhckVxdWFscyh0eXBlLCBhLCBiKSB7XG4gICAgaWYgKGEgPT09IGIpIHtcbiAgICAgICAgLy8gVGhpcyBjb3JyZWN0bHkgbWF0Y2hlcyBlcXVhbCB2YWx1ZXMgZXhjZXB0IEJZVEVTIGFuZCAocG9zc2libHkpIDY0LWJpdCBpbnRlZ2Vycy5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIC8vIFNwZWNpYWwgY2FzZSBCWVRFUyAtIHdlIG5lZWQgdG8gY29tcGFyZSBlYWNoIGJ5dGUgaW5kaXZpZHVhbGx5XG4gICAgaWYgKHR5cGUgPT0gU2NhbGFyVHlwZS5CWVRFUykge1xuICAgICAgICBpZiAoIShhIGluc3RhbmNlb2YgVWludDhBcnJheSkgfHwgIShiIGluc3RhbmNlb2YgVWludDhBcnJheSkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoYS5sZW5ndGggIT09IGIubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoYVtpXSAhPT0gYltpXSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgLy8gU3BlY2lhbCBjYXNlIDY0LWJpdCBpbnRlZ2VycyAtIHdlIHN1cHBvcnQgbnVtYmVyLCBzdHJpbmcgYW5kIGJpZ2ludCByZXByZXNlbnRhdGlvbi5cbiAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlVJTlQ2NDpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZJWEVENjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5JTlQ2NDpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNGSVhFRDY0OlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0lOVDY0OlxuICAgICAgICAgICAgLy8gTG9vc2UgY29tcGFyaXNvbiB3aWxsIG1hdGNoIGJldHdlZW4gMG4sIDAgYW5kIFwiMFwiLlxuICAgICAgICAgICAgcmV0dXJuIGEgPT0gYjtcbiAgICB9XG4gICAgLy8gQW55dGhpbmcgdGhhdCBoYXNuJ3QgYmVlbiBjYXVnaHQgYnkgc3RyaWN0IGNvbXBhcmlzb24gb3Igc3BlY2lhbCBjYXNlZFxuICAgIC8vIEJZVEVTIGFuZCA2NC1iaXQgaW50ZWdlcnMgaXMgbm90IGVxdWFsLlxuICAgIHJldHVybiBmYWxzZTtcbn1cbi8qKlxuICogUmV0dXJucyB0aGUgemVybyB2YWx1ZSBmb3IgdGhlIGdpdmVuIHNjYWxhciB0eXBlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2NhbGFyWmVyb1ZhbHVlKHR5cGUsIGxvbmdBc1N0cmluZykge1xuICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU1RSSU5HOlxuICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5CT09MOlxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRE9VQkxFOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRkxPQVQ6XG4gICAgICAgICAgICByZXR1cm4gMC4wO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuSU5UNjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5VSU5UNjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TRklYRUQ2NDpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZJWEVENjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TSU5UNjQ6XG4gICAgICAgICAgICByZXR1cm4gKGxvbmdBc1N0cmluZyA/IFwiMFwiIDogcHJvdG9JbnQ2NC56ZXJvKTtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkJZVEVTOlxuICAgICAgICAgICAgcmV0dXJuIG5ldyBVaW50OEFycmF5KDApO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgLy8gSGFuZGxlcyBJTlQzMiwgVUlOVDMyLCBTSU5UMzIsIEZJWEVEMzIsIFNGSVhFRDMyLlxuICAgICAgICAgICAgLy8gV2UgZG8gbm90IHVzZSBpbmRpdmlkdWFsIGNhc2VzIHRvIHNhdmUgYSBmZXcgYnl0ZXMgY29kZSBzaXplLlxuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxufVxuLyoqXG4gKiBSZXR1cm5zIHRydWUgZm9yIGEgemVyby12YWx1ZS4gRm9yIGV4YW1wbGUsIGFuIGludGVnZXIgaGFzIHRoZSB6ZXJvLXZhbHVlIGAwYCxcbiAqIGEgYm9vbGVhbiBpcyBgZmFsc2VgLCBhIHN0cmluZyBpcyBgXCJcImAsIGFuZCBieXRlcyBpcyBhbiBlbXB0eSBVaW50OEFycmF5LlxuICpcbiAqIEluIHByb3RvMywgemVyby12YWx1ZXMgYXJlIG5vdCB3cml0dGVuIHRvIHRoZSB3aXJlLCB1bmxlc3MgdGhlIGZpZWxkIGlzXG4gKiBvcHRpb25hbCBvciByZXBlYXRlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzU2NhbGFyWmVyb1ZhbHVlKHR5cGUsIHZhbHVlKSB7XG4gICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5CT09MOlxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlID09PSBmYWxzZTtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNUUklORzpcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZSA9PT0gXCJcIjtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkJZVEVTOlxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlIGluc3RhbmNlb2YgVWludDhBcnJheSAmJiAhdmFsdWUuYnl0ZUxlbmd0aDtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZSA9PSAwOyAvLyBMb29zZSBjb21wYXJpc29uIG1hdGNoZXMgMG4sIDAgYW5kIFwiMFwiXG4gICAgfVxufVxuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5pbXBvcnQgeyBpc1NjYWxhclplcm9WYWx1ZSwgc2NhbGFyWmVyb1ZhbHVlIH0gZnJvbSBcIi4vc2NhbGFyLmpzXCI7XG4vLyBib290c3RyYXAtaW5qZWN0IGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LkZpZWxkUHJlc2VuY2UuSU1QTElDSVQ6IGNvbnN0ICRuYW1lOiBGZWF0dXJlU2V0X0ZpZWxkUHJlc2VuY2UuJGxvY2FsTmFtZSA9ICRudW1iZXI7XG5jb25zdCBJTVBMSUNJVCA9IDI7XG5leHBvcnQgY29uc3QgdW5zYWZlTG9jYWwgPSBTeW1ib2wuZm9yKFwicmVmbGVjdCB1bnNhZmUgbG9jYWxcIik7XG4vKipcbiAqIFJldHVybiB0aGUgc2VsZWN0ZWQgZmllbGQgb2YgYSBvbmVvZiBncm91cC5cbiAqXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gdW5zYWZlT25lb2ZDYXNlKFxuLy8gYmlvbWUtaWdub3JlIGxpbnQvc3VzcGljaW91cy9ub0V4cGxpY2l0QW55OiBgYW55YCBpcyB0aGUgYmVzdCBjaG9pY2UgZm9yIGR5bmFtaWMgYWNjZXNzXG50YXJnZXQsIG9uZW9mKSB7XG4gICAgY29uc3QgYyA9IHRhcmdldFtvbmVvZi5sb2NhbE5hbWVdLmNhc2U7XG4gICAgaWYgKGMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gYztcbiAgICB9XG4gICAgcmV0dXJuIG9uZW9mLmZpZWxkcy5maW5kKChmKSA9PiBmLmxvY2FsTmFtZSA9PT0gYyk7XG59XG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgZmllbGQgaXMgc2V0LlxuICpcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1bnNhZmVJc1NldChcbi8vIGJpb21lLWlnbm9yZSBsaW50L3N1c3BpY2lvdXMvbm9FeHBsaWNpdEFueTogYGFueWAgaXMgdGhlIGJlc3QgY2hvaWNlIGZvciBkeW5hbWljIGFjY2Vzc1xudGFyZ2V0LCBmaWVsZCkge1xuICAgIGNvbnN0IG5hbWUgPSBmaWVsZC5sb2NhbE5hbWU7XG4gICAgaWYgKGZpZWxkLm9uZW9mKSB7XG4gICAgICAgIHJldHVybiB0YXJnZXRbZmllbGQub25lb2YubG9jYWxOYW1lXS5jYXNlID09PSBuYW1lO1xuICAgIH1cbiAgICBpZiAoZmllbGQucHJlc2VuY2UgIT0gSU1QTElDSVQpIHtcbiAgICAgICAgLy8gRmllbGRzIHdpdGggZXhwbGljaXQgcHJlc2VuY2UgaGF2ZSBwcm9wZXJ0aWVzIG9uIHRoZSBwcm90b3R5cGUgY2hhaW5cbiAgICAgICAgLy8gZm9yIGRlZmF1bHQgLyB6ZXJvIHZhbHVlcyAoZXhjZXB0IGZvciBwcm90bzMpLlxuICAgICAgICByZXR1cm4gKHRhcmdldFtuYW1lXSAhPT0gdW5kZWZpbmVkICYmXG4gICAgICAgICAgICBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGFyZ2V0LCBuYW1lKSk7XG4gICAgfVxuICAgIHN3aXRjaCAoZmllbGQuZmllbGRLaW5kKSB7XG4gICAgICAgIGNhc2UgXCJsaXN0XCI6XG4gICAgICAgICAgICByZXR1cm4gdGFyZ2V0W25hbWVdLmxlbmd0aCA+IDA7XG4gICAgICAgIGNhc2UgXCJtYXBcIjpcbiAgICAgICAgICAgIHJldHVybiBPYmplY3Qua2V5cyh0YXJnZXRbbmFtZV0pLmxlbmd0aCA+IDA7XG4gICAgICAgIGNhc2UgXCJzY2FsYXJcIjpcbiAgICAgICAgICAgIHJldHVybiAhaXNTY2FsYXJaZXJvVmFsdWUoZmllbGQuc2NhbGFyLCB0YXJnZXRbbmFtZV0pO1xuICAgICAgICBjYXNlIFwiZW51bVwiOlxuICAgICAgICAgICAgcmV0dXJuIHRhcmdldFtuYW1lXSAhPT0gZmllbGQuZW51bS52YWx1ZXNbMF0ubnVtYmVyO1xuICAgIH1cbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJtZXNzYWdlIGZpZWxkIHdpdGggaW1wbGljaXQgcHJlc2VuY2VcIik7XG59XG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgZmllbGQgaXMgc2V0LCBidXQgb25seSBmb3Igc2luZ3VsYXIgZmllbGRzIHdpdGggZXhwbGljaXRcbiAqIHByZXNlbmNlIChwcm90bzIpLlxuICpcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1bnNhZmVJc1NldEV4cGxpY2l0KHRhcmdldCwgbG9jYWxOYW1lKSB7XG4gICAgcmV0dXJuIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGFyZ2V0LCBsb2NhbE5hbWUpICYmXG4gICAgICAgIHRhcmdldFtsb2NhbE5hbWVdICE9PSB1bmRlZmluZWQpO1xufVxuLyoqXG4gKiBSZXR1cm4gYSBmaWVsZCB2YWx1ZSwgcmVzcGVjdGluZyBvbmVvZiBncm91cHMuXG4gKlxuICogQHByaXZhdGVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHVuc2FmZUdldCh0YXJnZXQsIGZpZWxkKSB7XG4gICAgaWYgKGZpZWxkLm9uZW9mKSB7XG4gICAgICAgIGNvbnN0IG9uZW9mID0gdGFyZ2V0W2ZpZWxkLm9uZW9mLmxvY2FsTmFtZV07XG4gICAgICAgIGlmIChvbmVvZi5jYXNlID09PSBmaWVsZC5sb2NhbE5hbWUpIHtcbiAgICAgICAgICAgIHJldHVybiBvbmVvZi52YWx1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICByZXR1cm4gdGFyZ2V0W2ZpZWxkLmxvY2FsTmFtZV07XG59XG4vKipcbiAqIFNldCBhIGZpZWxkIHZhbHVlLCByZXNwZWN0aW5nIG9uZW9mIGdyb3Vwcy5cbiAqXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gdW5zYWZlU2V0KHRhcmdldCwgZmllbGQsIHZhbHVlKSB7XG4gICAgaWYgKGZpZWxkLm9uZW9mKSB7XG4gICAgICAgIHRhcmdldFtmaWVsZC5vbmVvZi5sb2NhbE5hbWVdID0ge1xuICAgICAgICAgICAgY2FzZTogZmllbGQubG9jYWxOYW1lLFxuICAgICAgICAgICAgdmFsdWU6IHZhbHVlLFxuICAgICAgICB9O1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgdGFyZ2V0W2ZpZWxkLmxvY2FsTmFtZV0gPSB2YWx1ZTtcbiAgICB9XG59XG4vKipcbiAqIFJlc2V0cyB0aGUgZmllbGQsIHNvIHRoYXQgdW5zYWZlSXNTZXQoKSB3aWxsIHJldHVybiBmYWxzZS5cbiAqXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gdW5zYWZlQ2xlYXIoXG4vLyBiaW9tZS1pZ25vcmUgbGludC9zdXNwaWNpb3VzL25vRXhwbGljaXRBbnk6IGBhbnlgIGlzIHRoZSBiZXN0IGNob2ljZSBmb3IgZHluYW1pYyBhY2Nlc3NcbnRhcmdldCwgZmllbGQpIHtcbiAgICBjb25zdCBuYW1lID0gZmllbGQubG9jYWxOYW1lO1xuICAgIGlmIChmaWVsZC5vbmVvZikge1xuICAgICAgICBjb25zdCBvbmVvZkxvY2FsTmFtZSA9IGZpZWxkLm9uZW9mLmxvY2FsTmFtZTtcbiAgICAgICAgaWYgKHRhcmdldFtvbmVvZkxvY2FsTmFtZV0uY2FzZSA9PT0gbmFtZSkge1xuICAgICAgICAgICAgdGFyZ2V0W29uZW9mTG9jYWxOYW1lXSA9IHsgY2FzZTogdW5kZWZpbmVkIH07XG4gICAgICAgIH1cbiAgICB9XG4gICAgZWxzZSBpZiAoZmllbGQucHJlc2VuY2UgIT0gSU1QTElDSVQpIHtcbiAgICAgICAgLy8gRmllbGRzIHdpdGggZXhwbGljaXQgcHJlc2VuY2UgaGF2ZSBwcm9wZXJ0aWVzIG9uIHRoZSBwcm90b3R5cGUgY2hhaW5cbiAgICAgICAgLy8gZm9yIGRlZmF1bHQgLyB6ZXJvIHZhbHVlcyAoZXhjZXB0IGZvciBwcm90bzMpLiBCeSBkZWxldGluZyB0aGVpciBvd25cbiAgICAgICAgLy8gcHJvcGVydHksIHRoZSBmaWVsZCBpcyByZXNldC5cbiAgICAgICAgZGVsZXRlIHRhcmdldFtuYW1lXTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHN3aXRjaCAoZmllbGQuZmllbGRLaW5kKSB7XG4gICAgICAgICAgICBjYXNlIFwibWFwXCI6XG4gICAgICAgICAgICAgICAgdGFyZ2V0W25hbWVdID0ge307XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwibGlzdFwiOlxuICAgICAgICAgICAgICAgIHRhcmdldFtuYW1lXSA9IFtdO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcImVudW1cIjpcbiAgICAgICAgICAgICAgICB0YXJnZXRbbmFtZV0gPSBmaWVsZC5lbnVtLnZhbHVlc1swXS5udW1iZXI7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwic2NhbGFyXCI6XG4gICAgICAgICAgICAgICAgdGFyZ2V0W25hbWVdID0gc2NhbGFyWmVyb1ZhbHVlKGZpZWxkLnNjYWxhciwgZmllbGQubG9uZ0FzU3RyaW5nKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuaW1wb3J0IHsgdW5zYWZlTG9jYWwgfSBmcm9tIFwiLi91bnNhZmUuanNcIjtcbmV4cG9ydCBmdW5jdGlvbiBpc09iamVjdChhcmcpIHtcbiAgICByZXR1cm4gYXJnICE9PSBudWxsICYmIHR5cGVvZiBhcmcgPT0gXCJvYmplY3RcIiAmJiAhQXJyYXkuaXNBcnJheShhcmcpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGlzT25lb2ZBRFQoYXJnKSB7XG4gICAgcmV0dXJuIChhcmcgIT09IG51bGwgJiZcbiAgICAgICAgdHlwZW9mIGFyZyA9PSBcIm9iamVjdFwiICYmXG4gICAgICAgIFwiY2FzZVwiIGluIGFyZyAmJlxuICAgICAgICAoKHR5cGVvZiBhcmcuY2FzZSA9PSBcInN0cmluZ1wiICYmIFwidmFsdWVcIiBpbiBhcmcgJiYgYXJnLnZhbHVlICE9IG51bGwpIHx8XG4gICAgICAgICAgICAoYXJnLmNhc2UgPT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAgICAgICAgICghKFwidmFsdWVcIiBpbiBhcmcpIHx8IGFyZy52YWx1ZSA9PT0gdW5kZWZpbmVkKSkpKTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBpc1JlZmxlY3RMaXN0KGFyZywgZmllbGQpIHtcbiAgICB2YXIgX2EsIF9iLCBfYywgX2Q7XG4gICAgaWYgKGlzT2JqZWN0KGFyZykgJiZcbiAgICAgICAgdW5zYWZlTG9jYWwgaW4gYXJnICYmXG4gICAgICAgIFwiYWRkXCIgaW4gYXJnICYmXG4gICAgICAgIFwiZmllbGRcIiBpbiBhcmcgJiZcbiAgICAgICAgdHlwZW9mIGFyZy5maWVsZCA9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgaWYgKGZpZWxkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbnN0IGEgPSBmaWVsZDtcbiAgICAgICAgICAgIGNvbnN0IGIgPSBhcmcuZmllbGQoKTtcbiAgICAgICAgICAgIHJldHVybiAoYS5saXN0S2luZCA9PSBiLmxpc3RLaW5kICYmXG4gICAgICAgICAgICAgICAgYS5zY2FsYXIgPT09IGIuc2NhbGFyICYmXG4gICAgICAgICAgICAgICAgKChfYSA9IGEubWVzc2FnZSkgPT09IG51bGwgfHwgX2EgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9hLnR5cGVOYW1lKSA9PT0gKChfYiA9IGIubWVzc2FnZSkgPT09IG51bGwgfHwgX2IgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9iLnR5cGVOYW1lKSAmJlxuICAgICAgICAgICAgICAgICgoX2MgPSBhLmVudW0pID09PSBudWxsIHx8IF9jID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfYy50eXBlTmFtZSkgPT09ICgoX2QgPSBiLmVudW0pID09PSBudWxsIHx8IF9kID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfZC50eXBlTmFtZSkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5leHBvcnQgZnVuY3Rpb24gaXNSZWZsZWN0TWFwKGFyZywgZmllbGQpIHtcbiAgICB2YXIgX2EsIF9iLCBfYywgX2Q7XG4gICAgaWYgKGlzT2JqZWN0KGFyZykgJiZcbiAgICAgICAgdW5zYWZlTG9jYWwgaW4gYXJnICYmXG4gICAgICAgIFwiaGFzXCIgaW4gYXJnICYmXG4gICAgICAgIFwiZmllbGRcIiBpbiBhcmcgJiZcbiAgICAgICAgdHlwZW9mIGFyZy5maWVsZCA9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgaWYgKGZpZWxkICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbnN0IGEgPSBmaWVsZCwgYiA9IGFyZy5maWVsZCgpO1xuICAgICAgICAgICAgcmV0dXJuIChhLm1hcEtleSA9PT0gYi5tYXBLZXkgJiZcbiAgICAgICAgICAgICAgICBhLm1hcEtpbmQgPT0gYi5tYXBLaW5kICYmXG4gICAgICAgICAgICAgICAgYS5zY2FsYXIgPT09IGIuc2NhbGFyICYmXG4gICAgICAgICAgICAgICAgKChfYSA9IGEubWVzc2FnZSkgPT09IG51bGwgfHwgX2EgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9hLnR5cGVOYW1lKSA9PT0gKChfYiA9IGIubWVzc2FnZSkgPT09IG51bGwgfHwgX2IgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9iLnR5cGVOYW1lKSAmJlxuICAgICAgICAgICAgICAgICgoX2MgPSBhLmVudW0pID09PSBudWxsIHx8IF9jID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfYy50eXBlTmFtZSkgPT09ICgoX2QgPSBiLmVudW0pID09PSBudWxsIHx8IF9kID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfZC50eXBlTmFtZSkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5leHBvcnQgZnVuY3Rpb24gaXNSZWZsZWN0TWVzc2FnZShhcmcsIG1lc3NhZ2VEZXNjKSB7XG4gICAgcmV0dXJuIChpc09iamVjdChhcmcpICYmXG4gICAgICAgIHVuc2FmZUxvY2FsIGluIGFyZyAmJlxuICAgICAgICBcImRlc2NcIiBpbiBhcmcgJiZcbiAgICAgICAgaXNPYmplY3QoYXJnLmRlc2MpICYmXG4gICAgICAgIGFyZy5kZXNjLmtpbmQgPT09IFwibWVzc2FnZVwiICYmXG4gICAgICAgIChtZXNzYWdlRGVzYyA9PT0gdW5kZWZpbmVkIHx8IGFyZy5kZXNjLnR5cGVOYW1lID09IG1lc3NhZ2VEZXNjLnR5cGVOYW1lKSk7XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbmV4cG9ydCBmdW5jdGlvbiBpc1dyYXBwZXIoYXJnKSB7XG4gICAgcmV0dXJuIGlzV3JhcHBlclR5cGVOYW1lKGFyZy4kdHlwZU5hbWUpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGlzV3JhcHBlckRlc2MobWVzc2FnZURlc2MpIHtcbiAgICBjb25zdCBmID0gbWVzc2FnZURlc2MuZmllbGRzWzBdO1xuICAgIHJldHVybiAoaXNXcmFwcGVyVHlwZU5hbWUobWVzc2FnZURlc2MudHlwZU5hbWUpICYmXG4gICAgICAgIGYgIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICBmLmZpZWxkS2luZCA9PSBcInNjYWxhclwiICYmXG4gICAgICAgIGYubmFtZSA9PSBcInZhbHVlXCIgJiZcbiAgICAgICAgZi5udW1iZXIgPT0gMSk7XG59XG5mdW5jdGlvbiBpc1dyYXBwZXJUeXBlTmFtZShuYW1lKSB7XG4gICAgcmV0dXJuIChuYW1lLnN0YXJ0c1dpdGgoXCJnb29nbGUucHJvdG9idWYuXCIpICYmXG4gICAgICAgIFtcbiAgICAgICAgICAgIFwiRG91YmxlVmFsdWVcIixcbiAgICAgICAgICAgIFwiRmxvYXRWYWx1ZVwiLFxuICAgICAgICAgICAgXCJJbnQ2NFZhbHVlXCIsXG4gICAgICAgICAgICBcIlVJbnQ2NFZhbHVlXCIsXG4gICAgICAgICAgICBcIkludDMyVmFsdWVcIixcbiAgICAgICAgICAgIFwiVUludDMyVmFsdWVcIixcbiAgICAgICAgICAgIFwiQm9vbFZhbHVlXCIsXG4gICAgICAgICAgICBcIlN0cmluZ1ZhbHVlXCIsXG4gICAgICAgICAgICBcIkJ5dGVzVmFsdWVcIixcbiAgICAgICAgXS5pbmNsdWRlcyhuYW1lLnN1YnN0cmluZygxNikpKTtcbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuaW1wb3J0IHsgaXNNZXNzYWdlIH0gZnJvbSBcIi4vaXMtbWVzc2FnZS5qc1wiO1xuaW1wb3J0IHsgU2NhbGFyVHlwZSwgfSBmcm9tIFwiLi9kZXNjcmlwdG9ycy5qc1wiO1xuaW1wb3J0IHsgc2NhbGFyWmVyb1ZhbHVlIH0gZnJvbSBcIi4vcmVmbGVjdC9zY2FsYXIuanNcIjtcbmltcG9ydCB7IGlzT2JqZWN0IH0gZnJvbSBcIi4vcmVmbGVjdC9ndWFyZC5qc1wiO1xuaW1wb3J0IHsgdW5zYWZlR2V0LCB1bnNhZmVPbmVvZkNhc2UsIHVuc2FmZVNldCB9IGZyb20gXCIuL3JlZmxlY3QvdW5zYWZlLmpzXCI7XG5pbXBvcnQgeyBpc1dyYXBwZXJEZXNjIH0gZnJvbSBcIi4vd2t0L3dyYXBwZXJzLmpzXCI7XG4vLyBib290c3RyYXAtaW5qZWN0IGdvb2dsZS5wcm90b2J1Zi5FZGl0aW9uLkVESVRJT05fUFJPVE8zOiBjb25zdCAkbmFtZTogRWRpdGlvbi4kbG9jYWxOYW1lID0gJG51bWJlcjtcbmNvbnN0IEVESVRJT05fUFJPVE8zID0gOTk5O1xuLy8gYm9vdHN0cmFwLWluamVjdCBnb29nbGUucHJvdG9idWYuRWRpdGlvbi5FRElUSU9OX1BST1RPMjogY29uc3QgJG5hbWU6IEVkaXRpb24uJGxvY2FsTmFtZSA9ICRudW1iZXI7XG5jb25zdCBFRElUSU9OX1BST1RPMiA9IDk5ODtcbi8vIGJvb3RzdHJhcC1pbmplY3QgZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXQuRmllbGRQcmVzZW5jZS5JTVBMSUNJVDogY29uc3QgJG5hbWU6IEZlYXR1cmVTZXRfRmllbGRQcmVzZW5jZS4kbG9jYWxOYW1lID0gJG51bWJlcjtcbmNvbnN0IElNUExJQ0lUID0gMjtcbi8qKlxuICogQ3JlYXRlIGEgbmV3IG1lc3NhZ2UgaW5zdGFuY2UuXG4gKlxuICogVGhlIHNlY29uZCBhcmd1bWVudCBpcyBhbiBvcHRpb25hbCBpbml0aWFsaXplciBvYmplY3QsIHdoZXJlIGFsbCBmaWVsZHMgYXJlXG4gKiBvcHRpb25hbC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZShzY2hlbWEsIGluaXQpIHtcbiAgICBpZiAoaXNNZXNzYWdlKGluaXQsIHNjaGVtYSkpIHtcbiAgICAgICAgcmV0dXJuIGluaXQ7XG4gICAgfVxuICAgIGNvbnN0IG1lc3NhZ2UgPSBjcmVhdGVaZXJvTWVzc2FnZShzY2hlbWEpO1xuICAgIGlmIChpbml0ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgaW5pdE1lc3NhZ2Uoc2NoZW1hLCBtZXNzYWdlLCBpbml0KTtcbiAgICB9XG4gICAgcmV0dXJuIG1lc3NhZ2U7XG59XG4vKipcbiAqIFNldHMgZmllbGQgdmFsdWVzIGZyb20gYSBNZXNzYWdlSW5pdFNoYXBlIG9uIGEgemVybyBtZXNzYWdlLlxuICovXG5mdW5jdGlvbiBpbml0TWVzc2FnZShtZXNzYWdlRGVzYywgbWVzc2FnZSwgaW5pdCkge1xuICAgIGZvciAoY29uc3QgbWVtYmVyIG9mIG1lc3NhZ2VEZXNjLm1lbWJlcnMpIHtcbiAgICAgICAgbGV0IHZhbHVlID0gaW5pdFttZW1iZXIubG9jYWxOYW1lXTtcbiAgICAgICAgaWYgKHZhbHVlID09IG51bGwpIHtcbiAgICAgICAgICAgIC8vIGludGVudGlvbmFsbHkgaWdub3JlIHVuZGVmaW5lZCBhbmQgbnVsbFxuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgbGV0IGZpZWxkO1xuICAgICAgICBpZiAobWVtYmVyLmtpbmQgPT0gXCJvbmVvZlwiKSB7XG4gICAgICAgICAgICBjb25zdCBvbmVvZkZpZWxkID0gdW5zYWZlT25lb2ZDYXNlKGluaXQsIG1lbWJlcik7XG4gICAgICAgICAgICBpZiAoIW9uZW9mRmllbGQpIHtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZpZWxkID0gb25lb2ZGaWVsZDtcbiAgICAgICAgICAgIHZhbHVlID0gdW5zYWZlR2V0KGluaXQsIG9uZW9mRmllbGQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgZmllbGQgPSBtZW1iZXI7XG4gICAgICAgIH1cbiAgICAgICAgc3dpdGNoIChmaWVsZC5maWVsZEtpbmQpIHtcbiAgICAgICAgICAgIGNhc2UgXCJtZXNzYWdlXCI6XG4gICAgICAgICAgICAgICAgdmFsdWUgPSB0b01lc3NhZ2UoZmllbGQsIHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJzY2FsYXJcIjpcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IGluaXRTY2FsYXIoZmllbGQsIHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJsaXN0XCI6XG4gICAgICAgICAgICAgICAgdmFsdWUgPSBpbml0TGlzdChmaWVsZCwgdmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcIm1hcFwiOlxuICAgICAgICAgICAgICAgIHZhbHVlID0gaW5pdE1hcChmaWVsZCwgdmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIHVuc2FmZVNldChtZXNzYWdlLCBmaWVsZCwgdmFsdWUpO1xuICAgIH1cbiAgICByZXR1cm4gbWVzc2FnZTtcbn1cbmZ1bmN0aW9uIGluaXRTY2FsYXIoZmllbGQsIHZhbHVlKSB7XG4gICAgaWYgKGZpZWxkLnNjYWxhciA9PSBTY2FsYXJUeXBlLkJZVEVTKSB7XG4gICAgICAgIHJldHVybiB0b1U4QXJyKHZhbHVlKTtcbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlO1xufVxuZnVuY3Rpb24gaW5pdE1hcChmaWVsZCwgdmFsdWUpIHtcbiAgICBpZiAoaXNPYmplY3QodmFsdWUpKSB7XG4gICAgICAgIGlmIChmaWVsZC5zY2FsYXIgPT0gU2NhbGFyVHlwZS5CWVRFUykge1xuICAgICAgICAgICAgcmV0dXJuIGNvbnZlcnRPYmplY3RWYWx1ZXModmFsdWUsIHRvVThBcnIpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChmaWVsZC5tYXBLaW5kID09IFwibWVzc2FnZVwiKSB7XG4gICAgICAgICAgICByZXR1cm4gY29udmVydE9iamVjdFZhbHVlcyh2YWx1ZSwgKHZhbCkgPT4gdG9NZXNzYWdlKGZpZWxkLCB2YWwpKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdmFsdWU7XG59XG5mdW5jdGlvbiBpbml0TGlzdChmaWVsZCwgdmFsdWUpIHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgaWYgKGZpZWxkLnNjYWxhciA9PSBTY2FsYXJUeXBlLkJZVEVTKSB7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWUubWFwKHRvVThBcnIpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChmaWVsZC5saXN0S2luZCA9PSBcIm1lc3NhZ2VcIikge1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlLm1hcCgoaXRlbSkgPT4gdG9NZXNzYWdlKGZpZWxkLCBpdGVtKSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlO1xufVxuZnVuY3Rpb24gdG9NZXNzYWdlKGZpZWxkLCB2YWx1ZSkge1xuICAgIGlmIChmaWVsZC5maWVsZEtpbmQgPT0gXCJtZXNzYWdlXCIgJiZcbiAgICAgICAgIWZpZWxkLm9uZW9mICYmXG4gICAgICAgIGlzV3JhcHBlckRlc2MoZmllbGQubWVzc2FnZSkpIHtcbiAgICAgICAgLy8gVHlwZXMgZnJvbSBnb29nbGUvcHJvdG9idWYvd3JhcHBlcnMucHJvdG8gYXJlIHVud3JhcHBlZCB3aGVuIHVzZWQgaW5cbiAgICAgICAgLy8gYSBzaW5ndWxhciBmaWVsZCB0aGF0IGlzIG5vdCBwYXJ0IG9mIGEgb25lb2YgZ3JvdXAuXG4gICAgICAgIHJldHVybiBpbml0U2NhbGFyKGZpZWxkLm1lc3NhZ2UuZmllbGRzWzBdLCB2YWx1ZSk7XG4gICAgfVxuICAgIGlmIChpc09iamVjdCh2YWx1ZSkpIHtcbiAgICAgICAgaWYgKGZpZWxkLm1lc3NhZ2UudHlwZU5hbWUgPT0gXCJnb29nbGUucHJvdG9idWYuU3RydWN0XCIgJiZcbiAgICAgICAgICAgIGZpZWxkLnBhcmVudC50eXBlTmFtZSAhPT0gXCJnb29nbGUucHJvdG9idWYuVmFsdWVcIikge1xuICAgICAgICAgICAgLy8gZ29vZ2xlLnByb3RvYnVmLlN0cnVjdCBpcyByZXByZXNlbnRlZCB3aXRoIEpzb25PYmplY3Qgd2hlbiB1c2VkIGluIGFcbiAgICAgICAgICAgIC8vIGZpZWxkLCBleGNlcHQgd2hlbiB1c2VkIGluIGdvb2dsZS5wcm90b2J1Zi5WYWx1ZS5cbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWlzTWVzc2FnZSh2YWx1ZSwgZmllbGQubWVzc2FnZSkpIHtcbiAgICAgICAgICAgIHJldHVybiBjcmVhdGUoZmllbGQubWVzc2FnZSwgdmFsdWUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZTtcbn1cbi8vIGNvbnZlcnRzIGFueSBBcnJheUxpa2U8bnVtYmVyPiB0byBVaW50OEFycmF5IGlmIG5lY2Vzc2FyeS5cbmZ1bmN0aW9uIHRvVThBcnIodmFsdWUpIHtcbiAgICByZXR1cm4gQXJyYXkuaXNBcnJheSh2YWx1ZSkgPyBuZXcgVWludDhBcnJheSh2YWx1ZSkgOiB2YWx1ZTtcbn1cbmZ1bmN0aW9uIGNvbnZlcnRPYmplY3RWYWx1ZXMob2JqLCBmbikge1xuICAgIGNvbnN0IHJldCA9IHt9O1xuICAgIGZvciAoY29uc3QgZW50cnkgb2YgT2JqZWN0LmVudHJpZXMob2JqKSkge1xuICAgICAgICByZXRbZW50cnlbMF1dID0gZm4oZW50cnlbMV0pO1xuICAgIH1cbiAgICByZXR1cm4gcmV0O1xufVxuY29uc3QgdG9rZW5aZXJvTWVzc2FnZUZpZWxkID0gU3ltYm9sKCk7XG5jb25zdCBtZXNzYWdlUHJvdG90eXBlcyA9IG5ldyBXZWFrTWFwKCk7XG4vKipcbiAqIENyZWF0ZSBhIHplcm8gbWVzc2FnZS5cbiAqL1xuZnVuY3Rpb24gY3JlYXRlWmVyb01lc3NhZ2UoZGVzYykge1xuICAgIGxldCBtc2c7XG4gICAgaWYgKCFuZWVkc1Byb3RvdHlwZUNoYWluKGRlc2MpKSB7XG4gICAgICAgIG1zZyA9IHtcbiAgICAgICAgICAgICR0eXBlTmFtZTogZGVzYy50eXBlTmFtZSxcbiAgICAgICAgfTtcbiAgICAgICAgZm9yIChjb25zdCBtZW1iZXIgb2YgZGVzYy5tZW1iZXJzKSB7XG4gICAgICAgICAgICBpZiAobWVtYmVyLmtpbmQgPT0gXCJvbmVvZlwiIHx8IG1lbWJlci5wcmVzZW5jZSA9PSBJTVBMSUNJVCkge1xuICAgICAgICAgICAgICAgIG1zZ1ttZW1iZXIubG9jYWxOYW1lXSA9IGNyZWF0ZVplcm9GaWVsZChtZW1iZXIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICAvLyBTdXBwb3J0IGRlZmF1bHQgdmFsdWVzIGFuZCB0cmFjayBwcmVzZW5jZSB2aWEgdGhlIHByb3RvdHlwZSBjaGFpblxuICAgICAgICBjb25zdCBjYWNoZWQgPSBtZXNzYWdlUHJvdG90eXBlcy5nZXQoZGVzYyk7XG4gICAgICAgIGxldCBwcm90b3R5cGU7XG4gICAgICAgIGxldCBtZW1iZXJzO1xuICAgICAgICBpZiAoY2FjaGVkKSB7XG4gICAgICAgICAgICAoeyBwcm90b3R5cGUsIG1lbWJlcnMgfSA9IGNhY2hlZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBwcm90b3R5cGUgPSB7fTtcbiAgICAgICAgICAgIG1lbWJlcnMgPSBuZXcgU2V0KCk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IG1lbWJlciBvZiBkZXNjLm1lbWJlcnMpIHtcbiAgICAgICAgICAgICAgICBpZiAobWVtYmVyLmtpbmQgPT0gXCJvbmVvZlwiKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIHdlIGNhbiBvbmx5IHB1dCBpbW11dGFibGUgdmFsdWVzIG9uIHRoZSBwcm90b3R5cGUsXG4gICAgICAgICAgICAgICAgICAgIC8vIG9uZW9mIEFEVHMgYXJlIG11dGFibGVcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChtZW1iZXIuZmllbGRLaW5kICE9IFwic2NhbGFyXCIgJiYgbWVtYmVyLmZpZWxkS2luZCAhPSBcImVudW1cIikge1xuICAgICAgICAgICAgICAgICAgICAvLyBvbmx5IHNjYWxhciBhbmQgZW51bSB2YWx1ZXMgYXJlIGltbXV0YWJsZSwgbWFwLCBsaXN0LCBhbmQgbWVzc2FnZVxuICAgICAgICAgICAgICAgICAgICAvLyBhcmUgbm90XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAobWVtYmVyLnByZXNlbmNlID09IElNUExJQ0lUKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGltcGxpY2l0IHByZXNlbmNlIHRyYWNrcyBmaWVsZCBwcmVzZW5jZSBieSB6ZXJvIHZhbHVlcyAtIGUuZy4gMCwgZmFsc2UsIFwiXCIsIGFyZSB1bnNldCwgMSwgdHJ1ZSwgXCJ4XCIgYXJlIHNldC5cbiAgICAgICAgICAgICAgICAgICAgLy8gbWVzc2FnZSwgbWFwLCBsaXN0IGZpZWxkcyBhcmUgbXV0YWJsZSwgYW5kIGFsc28gaGF2ZSBJTVBMSUNJVCBwcmVzZW5jZS5cbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG1lbWJlcnMuYWRkKG1lbWJlcik7XG4gICAgICAgICAgICAgICAgcHJvdG90eXBlW21lbWJlci5sb2NhbE5hbWVdID0gY3JlYXRlWmVyb0ZpZWxkKG1lbWJlcik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtZXNzYWdlUHJvdG90eXBlcy5zZXQoZGVzYywgeyBwcm90b3R5cGUsIG1lbWJlcnMgfSk7XG4gICAgICAgIH1cbiAgICAgICAgbXNnID0gT2JqZWN0LmNyZWF0ZShwcm90b3R5cGUpO1xuICAgICAgICBtc2cuJHR5cGVOYW1lID0gZGVzYy50eXBlTmFtZTtcbiAgICAgICAgZm9yIChjb25zdCBtZW1iZXIgb2YgZGVzYy5tZW1iZXJzKSB7XG4gICAgICAgICAgICBpZiAobWVtYmVycy5oYXMobWVtYmVyKSkge1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG1lbWJlci5raW5kID09IFwiZmllbGRcIikge1xuICAgICAgICAgICAgICAgIGlmIChtZW1iZXIuZmllbGRLaW5kID09IFwibWVzc2FnZVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAobWVtYmVyLmZpZWxkS2luZCA9PSBcInNjYWxhclwiIHx8IG1lbWJlci5maWVsZEtpbmQgPT0gXCJlbnVtXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1lbWJlci5wcmVzZW5jZSAhPSBJTVBMSUNJVCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtc2dbbWVtYmVyLmxvY2FsTmFtZV0gPSBjcmVhdGVaZXJvRmllbGQobWVtYmVyKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbXNnO1xufVxuLyoqXG4gKiBEbyB3ZSBuZWVkIHRoZSBwcm90b3R5cGUgY2hhaW4gdG8gdHJhY2sgZmllbGQgcHJlc2VuY2U/XG4gKi9cbmZ1bmN0aW9uIG5lZWRzUHJvdG90eXBlQ2hhaW4oZGVzYykge1xuICAgIHN3aXRjaCAoZGVzYy5maWxlLmVkaXRpb24pIHtcbiAgICAgICAgY2FzZSBFRElUSU9OX1BST1RPMzpcbiAgICAgICAgICAgIC8vIHByb3RvMyBhbHdheXMgdXNlcyBpbXBsaWNpdCBwcmVzZW5jZSwgd2UgbmV2ZXIgbmVlZCB0aGUgcHJvdG90eXBlIGNoYWluLlxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICBjYXNlIEVESVRJT05fUFJPVE8yOlxuICAgICAgICAgICAgLy8gcHJvdG8yIG5ldmVyIHVzZXMgaW1wbGljaXQgcHJlc2VuY2UsIHdlIGFsd2F5cyBuZWVkIHRoZSBwcm90b3R5cGUgY2hhaW4uXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIC8vIElmIGEgbWVzc2FnZSB1c2VzIHNjYWxhciBvciBlbnVtIGZpZWxkcyB3aXRoIGV4cGxpY2l0IHByZXNlbmNlLCB3ZSBuZWVkXG4gICAgICAgICAgICAvLyB0aGUgcHJvdG90eXBlIGNoYWluIHRvIHRyYWNrIHByZXNlbmNlLiBUaGlzIHJ1bGUgZG9lcyBub3QgYXBwbHkgdG8gZmllbGRzXG4gICAgICAgICAgICAvLyBpbiBhIG9uZW9mIGdyb3VwIC0gdGhleSB1c2UgYSBkaWZmZXJlbnQgbWVjaGFuaXNtIHRvIHRyYWNrIHByZXNlbmNlLlxuICAgICAgICAgICAgcmV0dXJuIGRlc2MuZmllbGRzLnNvbWUoKGYpID0+IGYucHJlc2VuY2UgIT0gSU1QTElDSVQgJiYgZi5maWVsZEtpbmQgIT0gXCJtZXNzYWdlXCIgJiYgIWYub25lb2YpO1xuICAgIH1cbn1cbi8qKlxuICogUmV0dXJucyBhIHplcm8gdmFsdWUgZm9yIG9uZW9mIGdyb3VwcywgYW5kIGZvciBldmVyeSBmaWVsZCBraW5kIGV4Y2VwdFxuICogbWVzc2FnZXMuIFNjYWxhciBhbmQgZW51bSBmaWVsZHMgY2FuIGhhdmUgZGVmYXVsdCB2YWx1ZXMuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZVplcm9GaWVsZChmaWVsZCkge1xuICAgIGlmIChmaWVsZC5raW5kID09IFwib25lb2ZcIikge1xuICAgICAgICByZXR1cm4geyBjYXNlOiB1bmRlZmluZWQgfTtcbiAgICB9XG4gICAgaWYgKGZpZWxkLmZpZWxkS2luZCA9PSBcImxpc3RcIikge1xuICAgICAgICByZXR1cm4gW107XG4gICAgfVxuICAgIGlmIChmaWVsZC5maWVsZEtpbmQgPT0gXCJtYXBcIikge1xuICAgICAgICByZXR1cm4ge307IC8vIE9iamVjdC5jcmVhdGUobnVsbCkgd291bGQgYmUgZGVzaXJhYmxlIGhlcmUsIGJ1dCBpcyB1bnN1cHBvcnRlZCBieSByZWFjdCBodHRwczovL3JlYWN0LmRldi9yZWZlcmVuY2UvcmVhY3QvdXNlLXNlcnZlciNzZXJpYWxpemFibGUtcGFyYW1ldGVycy1hbmQtcmV0dXJuLXZhbHVlc1xuICAgIH1cbiAgICBpZiAoZmllbGQuZmllbGRLaW5kID09IFwibWVzc2FnZVwiKSB7XG4gICAgICAgIHJldHVybiB0b2tlblplcm9NZXNzYWdlRmllbGQ7XG4gICAgfVxuICAgIGNvbnN0IGRlZmF1bHRWYWx1ZSA9IGZpZWxkLmdldERlZmF1bHRWYWx1ZSgpO1xuICAgIGlmIChkZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gZmllbGQuZmllbGRLaW5kID09IFwic2NhbGFyXCIgJiYgZmllbGQubG9uZ0FzU3RyaW5nXG4gICAgICAgICAgICA/IGRlZmF1bHRWYWx1ZS50b1N0cmluZygpXG4gICAgICAgICAgICA6IGRlZmF1bHRWYWx1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZpZWxkLmZpZWxkS2luZCA9PSBcInNjYWxhclwiXG4gICAgICAgID8gc2NhbGFyWmVyb1ZhbHVlKGZpZWxkLnNjYWxhciwgZmllbGQubG9uZ0FzU3RyaW5nKVxuICAgICAgICA6IGZpZWxkLmVudW0udmFsdWVzWzBdLm51bWJlcjtcbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuY29uc3QgZXJyb3JOYW1lcyA9IFtcbiAgICBcIkZpZWxkVmFsdWVJbnZhbGlkRXJyb3JcIixcbiAgICBcIkZpZWxkTGlzdFJhbmdlRXJyb3JcIixcbiAgICBcIkZvcmVpZ25GaWVsZEVycm9yXCIsXG5dO1xuZXhwb3J0IGNsYXNzIEZpZWxkRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gICAgY29uc3RydWN0b3IoZmllbGRPck9uZW9mLCBtZXNzYWdlLCBuYW1lID0gXCJGaWVsZFZhbHVlSW52YWxpZEVycm9yXCIpIHtcbiAgICAgICAgc3VwZXIobWVzc2FnZSk7XG4gICAgICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgICAgIHRoaXMuZmllbGQgPSAoKSA9PiBmaWVsZE9yT25lb2Y7XG4gICAgfVxufVxuZXhwb3J0IGZ1bmN0aW9uIGlzRmllbGRFcnJvcihhcmcpIHtcbiAgICByZXR1cm4gKGFyZyBpbnN0YW5jZW9mIEVycm9yICYmXG4gICAgICAgIGVycm9yTmFtZXMuaW5jbHVkZXMoYXJnLm5hbWUpICYmXG4gICAgICAgIFwiZmllbGRcIiBpbiBhcmcgJiZcbiAgICAgICAgdHlwZW9mIGFyZy5maWVsZCA9PSBcImZ1bmN0aW9uXCIpO1xufVxuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5jb25zdCBzeW1ib2wgPSBTeW1ib2wuZm9yKFwiQGJ1ZmJ1aWxkL3Byb3RvYnVmL3RleHQtZW5jb2RpbmdcIik7XG4vKipcbiAqIFByb3RvYnVmLUVTIHJlcXVpcmVzIHRoZSBUZXh0IEVuY29kaW5nIEFQSSB0byBjb252ZXJ0IFVURi04IGZyb20gYW5kIHRvXG4gKiBiaW5hcnkuIFRoaXMgV0hBVFdHIEFQSSBpcyB3aWRlbHkgYXZhaWxhYmxlLCBidXQgaXQgaXMgbm90IHBhcnQgb2YgdGhlXG4gKiBFQ01BU2NyaXB0IHN0YW5kYXJkLiBPbiBydW50aW1lcyB3aGVyZSBpdCBpcyBub3QgYXZhaWxhYmxlLCB1c2UgdGhpc1xuICogZnVuY3Rpb24gdG8gcHJvdmlkZSB5b3VyIG93biBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBOb3RlIHRoYXQgdGhlIFRleHQgRW5jb2RpbmcgQVBJIGRvZXMgbm90IHByb3ZpZGUgYSB3YXkgdG8gdmFsaWRhdGUgVVRGLTguXG4gKiBPdXIgaW1wbGVtZW50YXRpb24gZmFsbHMgYmFjayB0byB1c2UgZW5jb2RlVVJJQ29tcG9uZW50KCkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb25maWd1cmVUZXh0RW5jb2RpbmcodGV4dEVuY29kaW5nKSB7XG4gICAgZ2xvYmFsVGhpc1tzeW1ib2xdID0gdGV4dEVuY29kaW5nO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGdldFRleHRFbmNvZGluZygpIHtcbiAgICBpZiAoZ2xvYmFsVGhpc1tzeW1ib2xdID09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCB0ZSA9IG5ldyBnbG9iYWxUaGlzLlRleHRFbmNvZGVyKCk7XG4gICAgICAgIGNvbnN0IHRkID0gbmV3IGdsb2JhbFRoaXMuVGV4dERlY29kZXIoKTtcbiAgICAgICAgZ2xvYmFsVGhpc1tzeW1ib2xdID0ge1xuICAgICAgICAgICAgZW5jb2RlVXRmOCh0ZXh0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRlLmVuY29kZSh0ZXh0KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBkZWNvZGVVdGY4KGJ5dGVzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRkLmRlY29kZShieXRlcyk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY2hlY2tVdGY4KHRleHQpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBlbmNvZGVVUklDb21wb25lbnQodGV4dCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXRjaCAoXykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIGdsb2JhbFRoaXNbc3ltYm9sXTtcbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuaW1wb3J0IHsgdmFyaW50MzJyZWFkLCB2YXJpbnQzMndyaXRlLCB2YXJpbnQ2NHJlYWQsIHZhcmludDY0d3JpdGUsIH0gZnJvbSBcIi4vdmFyaW50LmpzXCI7XG5pbXBvcnQgeyBwcm90b0ludDY0IH0gZnJvbSBcIi4uL3Byb3RvLWludDY0LmpzXCI7XG5pbXBvcnQgeyBnZXRUZXh0RW5jb2RpbmcgfSBmcm9tIFwiLi90ZXh0LWVuY29kaW5nLmpzXCI7XG4vKipcbiAqIFByb3RvYnVmIGJpbmFyeSBmb3JtYXQgd2lyZSB0eXBlcy5cbiAqXG4gKiBBIHdpcmUgdHlwZSBwcm92aWRlcyBqdXN0IGVub3VnaCBpbmZvcm1hdGlvbiB0byBmaW5kIHRoZSBsZW5ndGggb2YgdGhlXG4gKiBmb2xsb3dpbmcgdmFsdWUuXG4gKlxuICogU2VlIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL3Byb3RvY29sLWJ1ZmZlcnMvZG9jcy9lbmNvZGluZyNzdHJ1Y3R1cmVcbiAqL1xuZXhwb3J0IHZhciBXaXJlVHlwZTtcbihmdW5jdGlvbiAoV2lyZVR5cGUpIHtcbiAgICAvKipcbiAgICAgKiBVc2VkIGZvciBpbnQzMiwgaW50NjQsIHVpbnQzMiwgdWludDY0LCBzaW50MzIsIHNpbnQ2NCwgYm9vbCwgZW51bVxuICAgICAqL1xuICAgIFdpcmVUeXBlW1dpcmVUeXBlW1wiVmFyaW50XCJdID0gMF0gPSBcIlZhcmludFwiO1xuICAgIC8qKlxuICAgICAqIFVzZWQgZm9yIGZpeGVkNjQsIHNmaXhlZDY0LCBkb3VibGUuXG4gICAgICogQWx3YXlzIDggYnl0ZXMgd2l0aCBsaXR0bGUtZW5kaWFuIGJ5dGUgb3JkZXIuXG4gICAgICovXG4gICAgV2lyZVR5cGVbV2lyZVR5cGVbXCJCaXQ2NFwiXSA9IDFdID0gXCJCaXQ2NFwiO1xuICAgIC8qKlxuICAgICAqIFVzZWQgZm9yIHN0cmluZywgYnl0ZXMsIGVtYmVkZGVkIG1lc3NhZ2VzLCBwYWNrZWQgcmVwZWF0ZWQgZmllbGRzXG4gICAgICpcbiAgICAgKiBPbmx5IHJlcGVhdGVkIG51bWVyaWMgdHlwZXMgKHR5cGVzIHdoaWNoIHVzZSB0aGUgdmFyaW50LCAzMi1iaXQsXG4gICAgICogb3IgNjQtYml0IHdpcmUgdHlwZXMpIGNhbiBiZSBwYWNrZWQuIEluIHByb3RvMywgc3VjaCBmaWVsZHMgYXJlXG4gICAgICogcGFja2VkIGJ5IGRlZmF1bHQuXG4gICAgICovXG4gICAgV2lyZVR5cGVbV2lyZVR5cGVbXCJMZW5ndGhEZWxpbWl0ZWRcIl0gPSAyXSA9IFwiTGVuZ3RoRGVsaW1pdGVkXCI7XG4gICAgLyoqXG4gICAgICogU3RhcnQgb2YgYSB0YWctZGVsaW1pdGVkIGFnZ3JlZ2F0ZSwgc3VjaCBhcyBhIHByb3RvMiBncm91cCwgb3IgYSBtZXNzYWdlXG4gICAgICogaW4gZWRpdGlvbnMgd2l0aCBtZXNzYWdlX2VuY29kaW5nID0gREVMSU1JVEVELlxuICAgICAqL1xuICAgIFdpcmVUeXBlW1dpcmVUeXBlW1wiU3RhcnRHcm91cFwiXSA9IDNdID0gXCJTdGFydEdyb3VwXCI7XG4gICAgLyoqXG4gICAgICogRW5kIG9mIGEgdGFnLWRlbGltaXRlZCBhZ2dyZWdhdGUuXG4gICAgICovXG4gICAgV2lyZVR5cGVbV2lyZVR5cGVbXCJFbmRHcm91cFwiXSA9IDRdID0gXCJFbmRHcm91cFwiO1xuICAgIC8qKlxuICAgICAqIFVzZWQgZm9yIGZpeGVkMzIsIHNmaXhlZDMyLCBmbG9hdC5cbiAgICAgKiBBbHdheXMgNCBieXRlcyB3aXRoIGxpdHRsZS1lbmRpYW4gYnl0ZSBvcmRlci5cbiAgICAgKi9cbiAgICBXaXJlVHlwZVtXaXJlVHlwZVtcIkJpdDMyXCJdID0gNV0gPSBcIkJpdDMyXCI7XG59KShXaXJlVHlwZSB8fCAoV2lyZVR5cGUgPSB7fSkpO1xuLyoqXG4gKiBNYXhpbXVtIHZhbHVlIGZvciBhIDMyLWJpdCBmbG9hdGluZyBwb2ludCB2YWx1ZSAoUHJvdG9idWYgRkxPQVQpLlxuICovXG5leHBvcnQgY29uc3QgRkxPQVQzMl9NQVggPSAzLjQwMjgyMzQ2NjM4NTI4ODZlMzg7XG4vKipcbiAqIE1pbmltdW0gdmFsdWUgZm9yIGEgMzItYml0IGZsb2F0aW5nIHBvaW50IHZhbHVlIChQcm90b2J1ZiBGTE9BVCkuXG4gKi9cbmV4cG9ydCBjb25zdCBGTE9BVDMyX01JTiA9IC0zLjQwMjgyMzQ2NjM4NTI4ODZlMzg7XG4vKipcbiAqIE1heGltdW0gdmFsdWUgZm9yIGFuIHVuc2lnbmVkIDMyLWJpdCBpbnRlZ2VyIChQcm90b2J1ZiBVSU5UMzIsIEZJWEVEMzIpLlxuICovXG5leHBvcnQgY29uc3QgVUlOVDMyX01BWCA9IDB4ZmZmZmZmZmY7XG4vKipcbiAqIE1heGltdW0gdmFsdWUgZm9yIGEgc2lnbmVkIDMyLWJpdCBpbnRlZ2VyIChQcm90b2J1ZiBJTlQzMiwgU0ZJWEVEMzIsIFNJTlQzMikuXG4gKi9cbmV4cG9ydCBjb25zdCBJTlQzMl9NQVggPSAweDdmZmZmZmZmO1xuLyoqXG4gKiBNaW5pbXVtIHZhbHVlIGZvciBhIHNpZ25lZCAzMi1iaXQgaW50ZWdlciAoUHJvdG9idWYgSU5UMzIsIFNGSVhFRDMyLCBTSU5UMzIpLlxuICovXG5leHBvcnQgY29uc3QgSU5UMzJfTUlOID0gLTB4ODAwMDAwMDA7XG5leHBvcnQgY2xhc3MgQmluYXJ5V3JpdGVyIHtcbiAgICBjb25zdHJ1Y3RvcihlbmNvZGVVdGY4ID0gZ2V0VGV4dEVuY29kaW5nKCkuZW5jb2RlVXRmOCkge1xuICAgICAgICB0aGlzLmVuY29kZVV0ZjggPSBlbmNvZGVVdGY4O1xuICAgICAgICAvKipcbiAgICAgICAgICogUHJldmlvdXMgZm9yayBzdGF0ZXMuXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLnN0YWNrID0gW107XG4gICAgICAgIHRoaXMuY2h1bmtzID0gW107XG4gICAgICAgIHRoaXMuYnVmID0gW107XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFJldHVybiBhbGwgYnl0ZXMgd3JpdHRlbiBhbmQgcmVzZXQgdGhpcyB3cml0ZXIuXG4gICAgICovXG4gICAgZmluaXNoKCkge1xuICAgICAgICBpZiAodGhpcy5idWYubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aGlzLmNodW5rcy5wdXNoKG5ldyBVaW50OEFycmF5KHRoaXMuYnVmKSk7IC8vIGZsdXNoIHRoZSBidWZmZXJcbiAgICAgICAgICAgIHRoaXMuYnVmID0gW107XG4gICAgICAgIH1cbiAgICAgICAgbGV0IGxlbiA9IDA7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5jaHVua3MubGVuZ3RoOyBpKyspXG4gICAgICAgICAgICBsZW4gKz0gdGhpcy5jaHVua3NbaV0ubGVuZ3RoO1xuICAgICAgICBsZXQgYnl0ZXMgPSBuZXcgVWludDhBcnJheShsZW4pO1xuICAgICAgICBsZXQgb2Zmc2V0ID0gMDtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmNodW5rcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYnl0ZXMuc2V0KHRoaXMuY2h1bmtzW2ldLCBvZmZzZXQpO1xuICAgICAgICAgICAgb2Zmc2V0ICs9IHRoaXMuY2h1bmtzW2ldLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNodW5rcyA9IFtdO1xuICAgICAgICByZXR1cm4gYnl0ZXM7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFN0YXJ0IGEgbmV3IGZvcmsgZm9yIGxlbmd0aC1kZWxpbWl0ZWQgZGF0YSBsaWtlIGEgbWVzc2FnZVxuICAgICAqIG9yIGEgcGFja2VkIHJlcGVhdGVkIGZpZWxkLlxuICAgICAqXG4gICAgICogTXVzdCBiZSBqb2luZWQgbGF0ZXIgd2l0aCBgam9pbigpYC5cbiAgICAgKi9cbiAgICBmb3JrKCkge1xuICAgICAgICB0aGlzLnN0YWNrLnB1c2goeyBjaHVua3M6IHRoaXMuY2h1bmtzLCBidWY6IHRoaXMuYnVmIH0pO1xuICAgICAgICB0aGlzLmNodW5rcyA9IFtdO1xuICAgICAgICB0aGlzLmJ1ZiA9IFtdO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgLyoqXG4gICAgICogSm9pbiB0aGUgbGFzdCBmb3JrLiBXcml0ZSBpdHMgbGVuZ3RoIGFuZCBieXRlcywgdGhlblxuICAgICAqIHJldHVybiB0byB0aGUgcHJldmlvdXMgc3RhdGUuXG4gICAgICovXG4gICAgam9pbigpIHtcbiAgICAgICAgLy8gZ2V0IGNodW5rIG9mIGZvcmtcbiAgICAgICAgbGV0IGNodW5rID0gdGhpcy5maW5pc2goKTtcbiAgICAgICAgLy8gcmVzdG9yZSBwcmV2aW91cyBzdGF0ZVxuICAgICAgICBsZXQgcHJldiA9IHRoaXMuc3RhY2sucG9wKCk7XG4gICAgICAgIGlmICghcHJldilcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImludmFsaWQgc3RhdGUsIGZvcmsgc3RhY2sgZW1wdHlcIik7XG4gICAgICAgIHRoaXMuY2h1bmtzID0gcHJldi5jaHVua3M7XG4gICAgICAgIHRoaXMuYnVmID0gcHJldi5idWY7XG4gICAgICAgIC8vIHdyaXRlIGxlbmd0aCBvZiBjaHVuayBhcyB2YXJpbnRcbiAgICAgICAgdGhpcy51aW50MzIoY2h1bmsuYnl0ZUxlbmd0aCk7XG4gICAgICAgIHJldHVybiB0aGlzLnJhdyhjaHVuayk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFdyaXRlcyBhIHRhZyAoZmllbGQgbnVtYmVyIGFuZCB3aXJlIHR5cGUpLlxuICAgICAqXG4gICAgICogRXF1aXZhbGVudCB0byBgdWludDMyKCAoZmllbGRObyA8PCAzIHwgdHlwZSkgPj4+IDAgKWAuXG4gICAgICpcbiAgICAgKiBHZW5lcmF0ZWQgY29kZSBzaG91bGQgY29tcHV0ZSB0aGUgdGFnIGFoZWFkIG9mIHRpbWUgYW5kIGNhbGwgYHVpbnQzMigpYC5cbiAgICAgKi9cbiAgICB0YWcoZmllbGRObywgdHlwZSkge1xuICAgICAgICByZXR1cm4gdGhpcy51aW50MzIoKChmaWVsZE5vIDw8IDMpIHwgdHlwZSkgPj4+IDApO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBXcml0ZSBhIGNodW5rIG9mIHJhdyBieXRlcy5cbiAgICAgKi9cbiAgICByYXcoY2h1bmspIHtcbiAgICAgICAgaWYgKHRoaXMuYnVmLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhpcy5jaHVua3MucHVzaChuZXcgVWludDhBcnJheSh0aGlzLmJ1ZikpO1xuICAgICAgICAgICAgdGhpcy5idWYgPSBbXTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNodW5rcy5wdXNoKGNodW5rKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFdyaXRlIGEgYHVpbnQzMmAgdmFsdWUsIGFuIHVuc2lnbmVkIDMyIGJpdCB2YXJpbnQuXG4gICAgICovXG4gICAgdWludDMyKHZhbHVlKSB7XG4gICAgICAgIGFzc2VydFVJbnQzMih2YWx1ZSk7XG4gICAgICAgIC8vIHdyaXRlIHZhbHVlIGFzIHZhcmludCAzMiwgaW5saW5lZCBmb3Igc3BlZWRcbiAgICAgICAgd2hpbGUgKHZhbHVlID4gMHg3Zikge1xuICAgICAgICAgICAgdGhpcy5idWYucHVzaCgodmFsdWUgJiAweDdmKSB8IDB4ODApO1xuICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZSA+Pj4gNztcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmJ1Zi5wdXNoKHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFdyaXRlIGEgYGludDMyYCB2YWx1ZSwgYSBzaWduZWQgMzIgYml0IHZhcmludC5cbiAgICAgKi9cbiAgICBpbnQzMih2YWx1ZSkge1xuICAgICAgICBhc3NlcnRJbnQzMih2YWx1ZSk7XG4gICAgICAgIHZhcmludDMyd3JpdGUodmFsdWUsIHRoaXMuYnVmKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFdyaXRlIGEgYGJvb2xgIHZhbHVlLCBhIHZhcmlhbnQuXG4gICAgICovXG4gICAgYm9vbCh2YWx1ZSkge1xuICAgICAgICB0aGlzLmJ1Zi5wdXNoKHZhbHVlID8gMSA6IDApO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgLyoqXG4gICAgICogV3JpdGUgYSBgYnl0ZXNgIHZhbHVlLCBsZW5ndGgtZGVsaW1pdGVkIGFyYml0cmFyeSBkYXRhLlxuICAgICAqL1xuICAgIGJ5dGVzKHZhbHVlKSB7XG4gICAgICAgIHRoaXMudWludDMyKHZhbHVlLmJ5dGVMZW5ndGgpOyAvLyB3cml0ZSBsZW5ndGggb2YgY2h1bmsgYXMgdmFyaW50XG4gICAgICAgIHJldHVybiB0aGlzLnJhdyh2YWx1ZSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFdyaXRlIGEgYHN0cmluZ2AgdmFsdWUsIGxlbmd0aC1kZWxpbWl0ZWQgZGF0YSBjb252ZXJ0ZWQgdG8gVVRGLTggdGV4dC5cbiAgICAgKi9cbiAgICBzdHJpbmcodmFsdWUpIHtcbiAgICAgICAgbGV0IGNodW5rID0gdGhpcy5lbmNvZGVVdGY4KHZhbHVlKTtcbiAgICAgICAgdGhpcy51aW50MzIoY2h1bmsuYnl0ZUxlbmd0aCk7IC8vIHdyaXRlIGxlbmd0aCBvZiBjaHVuayBhcyB2YXJpbnRcbiAgICAgICAgcmV0dXJuIHRoaXMucmF3KGNodW5rKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogV3JpdGUgYSBgZmxvYXRgIHZhbHVlLCAzMi1iaXQgZmxvYXRpbmcgcG9pbnQgbnVtYmVyLlxuICAgICAqL1xuICAgIGZsb2F0KHZhbHVlKSB7XG4gICAgICAgIGFzc2VydEZsb2F0MzIodmFsdWUpO1xuICAgICAgICBsZXQgY2h1bmsgPSBuZXcgVWludDhBcnJheSg0KTtcbiAgICAgICAgbmV3IERhdGFWaWV3KGNodW5rLmJ1ZmZlcikuc2V0RmxvYXQzMigwLCB2YWx1ZSwgdHJ1ZSk7XG4gICAgICAgIHJldHVybiB0aGlzLnJhdyhjaHVuayk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFdyaXRlIGEgYGRvdWJsZWAgdmFsdWUsIGEgNjQtYml0IGZsb2F0aW5nIHBvaW50IG51bWJlci5cbiAgICAgKi9cbiAgICBkb3VibGUodmFsdWUpIHtcbiAgICAgICAgbGV0IGNodW5rID0gbmV3IFVpbnQ4QXJyYXkoOCk7XG4gICAgICAgIG5ldyBEYXRhVmlldyhjaHVuay5idWZmZXIpLnNldEZsb2F0NjQoMCwgdmFsdWUsIHRydWUpO1xuICAgICAgICByZXR1cm4gdGhpcy5yYXcoY2h1bmspO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBXcml0ZSBhIGBmaXhlZDMyYCB2YWx1ZSwgYW4gdW5zaWduZWQsIGZpeGVkLWxlbmd0aCAzMi1iaXQgaW50ZWdlci5cbiAgICAgKi9cbiAgICBmaXhlZDMyKHZhbHVlKSB7XG4gICAgICAgIGFzc2VydFVJbnQzMih2YWx1ZSk7XG4gICAgICAgIGxldCBjaHVuayA9IG5ldyBVaW50OEFycmF5KDQpO1xuICAgICAgICBuZXcgRGF0YVZpZXcoY2h1bmsuYnVmZmVyKS5zZXRVaW50MzIoMCwgdmFsdWUsIHRydWUpO1xuICAgICAgICByZXR1cm4gdGhpcy5yYXcoY2h1bmspO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBXcml0ZSBhIGBzZml4ZWQzMmAgdmFsdWUsIGEgc2lnbmVkLCBmaXhlZC1sZW5ndGggMzItYml0IGludGVnZXIuXG4gICAgICovXG4gICAgc2ZpeGVkMzIodmFsdWUpIHtcbiAgICAgICAgYXNzZXJ0SW50MzIodmFsdWUpO1xuICAgICAgICBsZXQgY2h1bmsgPSBuZXcgVWludDhBcnJheSg0KTtcbiAgICAgICAgbmV3IERhdGFWaWV3KGNodW5rLmJ1ZmZlcikuc2V0SW50MzIoMCwgdmFsdWUsIHRydWUpO1xuICAgICAgICByZXR1cm4gdGhpcy5yYXcoY2h1bmspO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBXcml0ZSBhIGBzaW50MzJgIHZhbHVlLCBhIHNpZ25lZCwgemlnemFnLWVuY29kZWQgMzItYml0IHZhcmludC5cbiAgICAgKi9cbiAgICBzaW50MzIodmFsdWUpIHtcbiAgICAgICAgYXNzZXJ0SW50MzIodmFsdWUpO1xuICAgICAgICAvLyB6aWd6YWcgZW5jb2RlXG4gICAgICAgIHZhbHVlID0gKCh2YWx1ZSA8PCAxKSBeICh2YWx1ZSA+PiAzMSkpID4+PiAwO1xuICAgICAgICB2YXJpbnQzMndyaXRlKHZhbHVlLCB0aGlzLmJ1Zik7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBXcml0ZSBhIGBmaXhlZDY0YCB2YWx1ZSwgYSBzaWduZWQsIGZpeGVkLWxlbmd0aCA2NC1iaXQgaW50ZWdlci5cbiAgICAgKi9cbiAgICBzZml4ZWQ2NCh2YWx1ZSkge1xuICAgICAgICBsZXQgY2h1bmsgPSBuZXcgVWludDhBcnJheSg4KSwgdmlldyA9IG5ldyBEYXRhVmlldyhjaHVuay5idWZmZXIpLCB0YyA9IHByb3RvSW50NjQuZW5jKHZhbHVlKTtcbiAgICAgICAgdmlldy5zZXRJbnQzMigwLCB0Yy5sbywgdHJ1ZSk7XG4gICAgICAgIHZpZXcuc2V0SW50MzIoNCwgdGMuaGksIHRydWUpO1xuICAgICAgICByZXR1cm4gdGhpcy5yYXcoY2h1bmspO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBXcml0ZSBhIGBmaXhlZDY0YCB2YWx1ZSwgYW4gdW5zaWduZWQsIGZpeGVkLWxlbmd0aCA2NCBiaXQgaW50ZWdlci5cbiAgICAgKi9cbiAgICBmaXhlZDY0KHZhbHVlKSB7XG4gICAgICAgIGxldCBjaHVuayA9IG5ldyBVaW50OEFycmF5KDgpLCB2aWV3ID0gbmV3IERhdGFWaWV3KGNodW5rLmJ1ZmZlciksIHRjID0gcHJvdG9JbnQ2NC51RW5jKHZhbHVlKTtcbiAgICAgICAgdmlldy5zZXRJbnQzMigwLCB0Yy5sbywgdHJ1ZSk7XG4gICAgICAgIHZpZXcuc2V0SW50MzIoNCwgdGMuaGksIHRydWUpO1xuICAgICAgICByZXR1cm4gdGhpcy5yYXcoY2h1bmspO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBXcml0ZSBhIGBpbnQ2NGAgdmFsdWUsIGEgc2lnbmVkIDY0LWJpdCB2YXJpbnQuXG4gICAgICovXG4gICAgaW50NjQodmFsdWUpIHtcbiAgICAgICAgbGV0IHRjID0gcHJvdG9JbnQ2NC5lbmModmFsdWUpO1xuICAgICAgICB2YXJpbnQ2NHdyaXRlKHRjLmxvLCB0Yy5oaSwgdGhpcy5idWYpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgLyoqXG4gICAgICogV3JpdGUgYSBgc2ludDY0YCB2YWx1ZSwgYSBzaWduZWQsIHppZy16YWctZW5jb2RlZCA2NC1iaXQgdmFyaW50LlxuICAgICAqL1xuICAgIHNpbnQ2NCh2YWx1ZSkge1xuICAgICAgICBjb25zdCB0YyA9IHByb3RvSW50NjQuZW5jKHZhbHVlKSwgXG4gICAgICAgIC8vIHppZ3phZyBlbmNvZGVcbiAgICAgICAgc2lnbiA9IHRjLmhpID4+IDMxLCBsbyA9ICh0Yy5sbyA8PCAxKSBeIHNpZ24sIGhpID0gKCh0Yy5oaSA8PCAxKSB8ICh0Yy5sbyA+Pj4gMzEpKSBeIHNpZ247XG4gICAgICAgIHZhcmludDY0d3JpdGUobG8sIGhpLCB0aGlzLmJ1Zik7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBXcml0ZSBhIGB1aW50NjRgIHZhbHVlLCBhbiB1bnNpZ25lZCA2NC1iaXQgdmFyaW50LlxuICAgICAqL1xuICAgIHVpbnQ2NCh2YWx1ZSkge1xuICAgICAgICBjb25zdCB0YyA9IHByb3RvSW50NjQudUVuYyh2YWx1ZSk7XG4gICAgICAgIHZhcmludDY0d3JpdGUodGMubG8sIHRjLmhpLCB0aGlzLmJ1Zik7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbn1cbmV4cG9ydCBjbGFzcyBCaW5hcnlSZWFkZXIge1xuICAgIGNvbnN0cnVjdG9yKGJ1ZiwgZGVjb2RlVXRmOCA9IGdldFRleHRFbmNvZGluZygpLmRlY29kZVV0ZjgpIHtcbiAgICAgICAgdGhpcy5kZWNvZGVVdGY4ID0gZGVjb2RlVXRmODtcbiAgICAgICAgdGhpcy52YXJpbnQ2NCA9IHZhcmludDY0cmVhZDsgLy8gZGlydHkgY2FzdCBmb3IgYHRoaXNgXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSZWFkIGEgYHVpbnQzMmAgZmllbGQsIGFuIHVuc2lnbmVkIDMyIGJpdCB2YXJpbnQuXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLnVpbnQzMiA9IHZhcmludDMycmVhZDtcbiAgICAgICAgdGhpcy5idWYgPSBidWY7XG4gICAgICAgIHRoaXMubGVuID0gYnVmLmxlbmd0aDtcbiAgICAgICAgdGhpcy5wb3MgPSAwO1xuICAgICAgICB0aGlzLnZpZXcgPSBuZXcgRGF0YVZpZXcoYnVmLmJ1ZmZlciwgYnVmLmJ5dGVPZmZzZXQsIGJ1Zi5ieXRlTGVuZ3RoKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVhZHMgYSB0YWcgLSBmaWVsZCBudW1iZXIgYW5kIHdpcmUgdHlwZS5cbiAgICAgKi9cbiAgICB0YWcoKSB7XG4gICAgICAgIGxldCB0YWcgPSB0aGlzLnVpbnQzMigpLCBmaWVsZE5vID0gdGFnID4+PiAzLCB3aXJlVHlwZSA9IHRhZyAmIDc7XG4gICAgICAgIGlmIChmaWVsZE5vIDw9IDAgfHwgd2lyZVR5cGUgPCAwIHx8IHdpcmVUeXBlID4gNSlcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImlsbGVnYWwgdGFnOiBmaWVsZCBubyBcIiArIGZpZWxkTm8gKyBcIiB3aXJlIHR5cGUgXCIgKyB3aXJlVHlwZSk7XG4gICAgICAgIHJldHVybiBbZmllbGRObywgd2lyZVR5cGVdO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBTa2lwIG9uZSBlbGVtZW50IGFuZCByZXR1cm4gdGhlIHNraXBwZWQgZGF0YS5cbiAgICAgKlxuICAgICAqIFdoZW4gc2tpcHBpbmcgU3RhcnRHcm91cCwgcHJvdmlkZSB0aGUgdGFncyBmaWVsZCBudW1iZXIgdG8gY2hlY2sgZm9yXG4gICAgICogbWF0Y2hpbmcgZmllbGQgbnVtYmVyIGluIHRoZSBFbmRHcm91cCB0YWcuXG4gICAgICovXG4gICAgc2tpcCh3aXJlVHlwZSwgZmllbGRObykge1xuICAgICAgICBsZXQgc3RhcnQgPSB0aGlzLnBvcztcbiAgICAgICAgc3dpdGNoICh3aXJlVHlwZSkge1xuICAgICAgICAgICAgY2FzZSBXaXJlVHlwZS5WYXJpbnQ6XG4gICAgICAgICAgICAgICAgd2hpbGUgKHRoaXMuYnVmW3RoaXMucG9zKytdICYgMHg4MCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBpZ25vcmVcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAvLyBAdHMtaWdub3JlIFRTNzAyOTogRmFsbHRocm91Z2ggY2FzZSBpbiBzd2l0Y2ggLS0gaWdub3JlIGluc3RlYWQgb2YgZXhwZWN0LWVycm9yIGZvciBjb21waWxlciBzZXR0aW5ncyB3aXRob3V0IG5vRmFsbHRocm91Z2hDYXNlc0luU3dpdGNoOiB0cnVlXG4gICAgICAgICAgICBjYXNlIFdpcmVUeXBlLkJpdDY0OlxuICAgICAgICAgICAgICAgIHRoaXMucG9zICs9IDQ7XG4gICAgICAgICAgICBjYXNlIFdpcmVUeXBlLkJpdDMyOlxuICAgICAgICAgICAgICAgIHRoaXMucG9zICs9IDQ7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFdpcmVUeXBlLkxlbmd0aERlbGltaXRlZDpcbiAgICAgICAgICAgICAgICBsZXQgbGVuID0gdGhpcy51aW50MzIoKTtcbiAgICAgICAgICAgICAgICB0aGlzLnBvcyArPSBsZW47XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFdpcmVUeXBlLlN0YXJ0R3JvdXA6XG4gICAgICAgICAgICAgICAgZm9yICg7Oykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBbZm4sIHd0XSA9IHRoaXMudGFnKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh3dCA9PT0gV2lyZVR5cGUuRW5kR3JvdXApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChmaWVsZE5vICE9PSB1bmRlZmluZWQgJiYgZm4gIT09IGZpZWxkTm8pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbnZhbGlkIGVuZCBncm91cCB0YWdcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNraXAod3QsIGZuKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImNhbnQgc2tpcCB3aXJlIHR5cGUgXCIgKyB3aXJlVHlwZSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hc3NlcnRCb3VuZHMoKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuYnVmLnN1YmFycmF5KHN0YXJ0LCB0aGlzLnBvcyk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFRocm93cyBlcnJvciBpZiBwb3NpdGlvbiBpbiBieXRlIGFycmF5IGlzIG91dCBvZiByYW5nZS5cbiAgICAgKi9cbiAgICBhc3NlcnRCb3VuZHMoKSB7XG4gICAgICAgIGlmICh0aGlzLnBvcyA+IHRoaXMubGVuKVxuICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoXCJwcmVtYXR1cmUgRU9GXCIpO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBSZWFkIGEgYGludDMyYCBmaWVsZCwgYSBzaWduZWQgMzIgYml0IHZhcmludC5cbiAgICAgKi9cbiAgICBpbnQzMigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudWludDMyKCkgfCAwO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBSZWFkIGEgYHNpbnQzMmAgZmllbGQsIGEgc2lnbmVkLCB6aWd6YWctZW5jb2RlZCAzMi1iaXQgdmFyaW50LlxuICAgICAqL1xuICAgIHNpbnQzMigpIHtcbiAgICAgICAgbGV0IHp6ZSA9IHRoaXMudWludDMyKCk7XG4gICAgICAgIC8vIGRlY29kZSB6aWd6YWdcbiAgICAgICAgcmV0dXJuICh6emUgPj4+IDEpIF4gLSh6emUgJiAxKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVhZCBhIGBpbnQ2NGAgZmllbGQsIGEgc2lnbmVkIDY0LWJpdCB2YXJpbnQuXG4gICAgICovXG4gICAgaW50NjQoKSB7XG4gICAgICAgIHJldHVybiBwcm90b0ludDY0LmRlYyguLi50aGlzLnZhcmludDY0KCkpO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBSZWFkIGEgYHVpbnQ2NGAgZmllbGQsIGFuIHVuc2lnbmVkIDY0LWJpdCB2YXJpbnQuXG4gICAgICovXG4gICAgdWludDY0KCkge1xuICAgICAgICByZXR1cm4gcHJvdG9JbnQ2NC51RGVjKC4uLnRoaXMudmFyaW50NjQoKSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFJlYWQgYSBgc2ludDY0YCBmaWVsZCwgYSBzaWduZWQsIHppZy16YWctZW5jb2RlZCA2NC1iaXQgdmFyaW50LlxuICAgICAqL1xuICAgIHNpbnQ2NCgpIHtcbiAgICAgICAgbGV0IFtsbywgaGldID0gdGhpcy52YXJpbnQ2NCgpO1xuICAgICAgICAvLyBkZWNvZGUgemlnIHphZ1xuICAgICAgICBsZXQgcyA9IC0obG8gJiAxKTtcbiAgICAgICAgbG8gPSAoKGxvID4+PiAxKSB8ICgoaGkgJiAxKSA8PCAzMSkpIF4gcztcbiAgICAgICAgaGkgPSAoaGkgPj4+IDEpIF4gcztcbiAgICAgICAgcmV0dXJuIHByb3RvSW50NjQuZGVjKGxvLCBoaSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFJlYWQgYSBgYm9vbGAgZmllbGQsIGEgdmFyaWFudC5cbiAgICAgKi9cbiAgICBib29sKCkge1xuICAgICAgICBsZXQgW2xvLCBoaV0gPSB0aGlzLnZhcmludDY0KCk7XG4gICAgICAgIHJldHVybiBsbyAhPT0gMCB8fCBoaSAhPT0gMDtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVhZCBhIGBmaXhlZDMyYCBmaWVsZCwgYW4gdW5zaWduZWQsIGZpeGVkLWxlbmd0aCAzMi1iaXQgaW50ZWdlci5cbiAgICAgKi9cbiAgICBmaXhlZDMyKCkge1xuICAgICAgICAvLyBiaW9tZS1pZ25vcmUgbGludC9zdXNwaWNpb3VzL25vQXNzaWduSW5FeHByZXNzaW9uczogbm9cbiAgICAgICAgcmV0dXJuIHRoaXMudmlldy5nZXRVaW50MzIoKHRoaXMucG9zICs9IDQpIC0gNCwgdHJ1ZSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFJlYWQgYSBgc2ZpeGVkMzJgIGZpZWxkLCBhIHNpZ25lZCwgZml4ZWQtbGVuZ3RoIDMyLWJpdCBpbnRlZ2VyLlxuICAgICAqL1xuICAgIHNmaXhlZDMyKCkge1xuICAgICAgICAvLyBiaW9tZS1pZ25vcmUgbGludC9zdXNwaWNpb3VzL25vQXNzaWduSW5FeHByZXNzaW9uczogbm9cbiAgICAgICAgcmV0dXJuIHRoaXMudmlldy5nZXRJbnQzMigodGhpcy5wb3MgKz0gNCkgLSA0LCB0cnVlKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVhZCBhIGBmaXhlZDY0YCBmaWVsZCwgYW4gdW5zaWduZWQsIGZpeGVkLWxlbmd0aCA2NCBiaXQgaW50ZWdlci5cbiAgICAgKi9cbiAgICBmaXhlZDY0KCkge1xuICAgICAgICByZXR1cm4gcHJvdG9JbnQ2NC51RGVjKHRoaXMuc2ZpeGVkMzIoKSwgdGhpcy5zZml4ZWQzMigpKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVhZCBhIGBmaXhlZDY0YCBmaWVsZCwgYSBzaWduZWQsIGZpeGVkLWxlbmd0aCA2NC1iaXQgaW50ZWdlci5cbiAgICAgKi9cbiAgICBzZml4ZWQ2NCgpIHtcbiAgICAgICAgcmV0dXJuIHByb3RvSW50NjQuZGVjKHRoaXMuc2ZpeGVkMzIoKSwgdGhpcy5zZml4ZWQzMigpKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVhZCBhIGBmbG9hdGAgZmllbGQsIDMyLWJpdCBmbG9hdGluZyBwb2ludCBudW1iZXIuXG4gICAgICovXG4gICAgZmxvYXQoKSB7XG4gICAgICAgIC8vIGJpb21lLWlnbm9yZSBsaW50L3N1c3BpY2lvdXMvbm9Bc3NpZ25JbkV4cHJlc3Npb25zOiBub1xuICAgICAgICByZXR1cm4gdGhpcy52aWV3LmdldEZsb2F0MzIoKHRoaXMucG9zICs9IDQpIC0gNCwgdHJ1ZSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFJlYWQgYSBgZG91YmxlYCBmaWVsZCwgYSA2NC1iaXQgZmxvYXRpbmcgcG9pbnQgbnVtYmVyLlxuICAgICAqL1xuICAgIGRvdWJsZSgpIHtcbiAgICAgICAgLy8gYmlvbWUtaWdub3JlIGxpbnQvc3VzcGljaW91cy9ub0Fzc2lnbkluRXhwcmVzc2lvbnM6IG5vXG4gICAgICAgIHJldHVybiB0aGlzLnZpZXcuZ2V0RmxvYXQ2NCgodGhpcy5wb3MgKz0gOCkgLSA4LCB0cnVlKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVhZCBhIGBieXRlc2AgZmllbGQsIGxlbmd0aC1kZWxpbWl0ZWQgYXJiaXRyYXJ5IGRhdGEuXG4gICAgICovXG4gICAgYnl0ZXMoKSB7XG4gICAgICAgIGxldCBsZW4gPSB0aGlzLnVpbnQzMigpLCBzdGFydCA9IHRoaXMucG9zO1xuICAgICAgICB0aGlzLnBvcyArPSBsZW47XG4gICAgICAgIHRoaXMuYXNzZXJ0Qm91bmRzKCk7XG4gICAgICAgIHJldHVybiB0aGlzLmJ1Zi5zdWJhcnJheShzdGFydCwgc3RhcnQgKyBsZW4pO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBSZWFkIGEgYHN0cmluZ2AgZmllbGQsIGxlbmd0aC1kZWxpbWl0ZWQgZGF0YSBjb252ZXJ0ZWQgdG8gVVRGLTggdGV4dC5cbiAgICAgKi9cbiAgICBzdHJpbmcoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmRlY29kZVV0ZjgodGhpcy5ieXRlcygpKTtcbiAgICB9XG59XG4vKipcbiAqIEFzc2VydCBhIHZhbGlkIHNpZ25lZCBwcm90b2J1ZiAzMi1iaXQgaW50ZWdlciBhcyBhIG51bWJlciBvciBzdHJpbmcuXG4gKi9cbmZ1bmN0aW9uIGFzc2VydEludDMyKGFyZykge1xuICAgIGlmICh0eXBlb2YgYXJnID09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgYXJnID0gTnVtYmVyKGFyZyk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGVvZiBhcmcgIT0gXCJudW1iZXJcIikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbnZhbGlkIGludDMyOiBcIiArIHR5cGVvZiBhcmcpO1xuICAgIH1cbiAgICBpZiAoIU51bWJlci5pc0ludGVnZXIoYXJnKSB8fFxuICAgICAgICBhcmcgPiBJTlQzMl9NQVggfHxcbiAgICAgICAgYXJnIDwgSU5UMzJfTUlOKVxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbnZhbGlkIGludDMyOiBcIiArIGFyZyk7XG59XG4vKipcbiAqIEFzc2VydCBhIHZhbGlkIHVuc2lnbmVkIHByb3RvYnVmIDMyLWJpdCBpbnRlZ2VyIGFzIGEgbnVtYmVyIG9yIHN0cmluZy5cbiAqL1xuZnVuY3Rpb24gYXNzZXJ0VUludDMyKGFyZykge1xuICAgIGlmICh0eXBlb2YgYXJnID09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgYXJnID0gTnVtYmVyKGFyZyk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGVvZiBhcmcgIT0gXCJudW1iZXJcIikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbnZhbGlkIHVpbnQzMjogXCIgKyB0eXBlb2YgYXJnKTtcbiAgICB9XG4gICAgaWYgKCFOdW1iZXIuaXNJbnRlZ2VyKGFyZykgfHxcbiAgICAgICAgYXJnID4gVUlOVDMyX01BWCB8fFxuICAgICAgICBhcmcgPCAwKVxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbnZhbGlkIHVpbnQzMjogXCIgKyBhcmcpO1xufVxuLyoqXG4gKiBBc3NlcnQgYSB2YWxpZCBwcm90b2J1ZiBmbG9hdCB2YWx1ZSBhcyBhIG51bWJlciBvciBzdHJpbmcuXG4gKi9cbmZ1bmN0aW9uIGFzc2VydEZsb2F0MzIoYXJnKSB7XG4gICAgaWYgKHR5cGVvZiBhcmcgPT0gXCJzdHJpbmdcIikge1xuICAgICAgICBjb25zdCBvID0gYXJnO1xuICAgICAgICBhcmcgPSBOdW1iZXIoYXJnKTtcbiAgICAgICAgaWYgKE51bWJlci5pc05hTihhcmcpICYmIG8gIT09IFwiTmFOXCIpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImludmFsaWQgZmxvYXQzMjogXCIgKyBvKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlb2YgYXJnICE9IFwibnVtYmVyXCIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiaW52YWxpZCBmbG9hdDMyOiBcIiArIHR5cGVvZiBhcmcpO1xuICAgIH1cbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKGFyZykgJiZcbiAgICAgICAgKGFyZyA+IEZMT0FUMzJfTUFYIHx8IGFyZyA8IEZMT0FUMzJfTUlOKSlcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiaW52YWxpZCBmbG9hdDMyOiBcIiArIGFyZyk7XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbmltcG9ydCB7IFNjYWxhclR5cGUsIH0gZnJvbSBcIi4uL2Rlc2NyaXB0b3JzLmpzXCI7XG5pbXBvcnQgeyBpc01lc3NhZ2UgfSBmcm9tIFwiLi4vaXMtbWVzc2FnZS5qc1wiO1xuaW1wb3J0IHsgRmllbGRFcnJvciB9IGZyb20gXCIuL2Vycm9yLmpzXCI7XG5pbXBvcnQgeyBpc1JlZmxlY3RMaXN0LCBpc1JlZmxlY3RNYXAsIGlzUmVmbGVjdE1lc3NhZ2UgfSBmcm9tIFwiLi9ndWFyZC5qc1wiO1xuaW1wb3J0IHsgRkxPQVQzMl9NQVgsIEZMT0FUMzJfTUlOLCBJTlQzMl9NQVgsIElOVDMyX01JTiwgVUlOVDMyX01BWCwgfSBmcm9tIFwiLi4vd2lyZS9iaW5hcnktZW5jb2RpbmcuanNcIjtcbmltcG9ydCB7IGdldFRleHRFbmNvZGluZyB9IGZyb20gXCIuLi93aXJlL3RleHQtZW5jb2RpbmcuanNcIjtcbmltcG9ydCB7IHByb3RvSW50NjQgfSBmcm9tIFwiLi4vcHJvdG8taW50NjQuanNcIjtcbi8qKlxuICogQ2hlY2sgd2hldGhlciB0aGUgZ2l2ZW4gZmllbGQgdmFsdWUgaXMgdmFsaWQgZm9yIHRoZSByZWZsZWN0IEFQSS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNoZWNrRmllbGQoZmllbGQsIHZhbHVlKSB7XG4gICAgY29uc3QgY2hlY2sgPSBmaWVsZC5maWVsZEtpbmQgPT0gXCJsaXN0XCJcbiAgICAgICAgPyBpc1JlZmxlY3RMaXN0KHZhbHVlLCBmaWVsZClcbiAgICAgICAgOiBmaWVsZC5maWVsZEtpbmQgPT0gXCJtYXBcIlxuICAgICAgICAgICAgPyBpc1JlZmxlY3RNYXAodmFsdWUsIGZpZWxkKVxuICAgICAgICAgICAgOiBjaGVja1Npbmd1bGFyKGZpZWxkLCB2YWx1ZSk7XG4gICAgaWYgKGNoZWNrID09PSB0cnVlKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGxldCByZWFzb247XG4gICAgc3dpdGNoIChmaWVsZC5maWVsZEtpbmQpIHtcbiAgICAgICAgY2FzZSBcImxpc3RcIjpcbiAgICAgICAgICAgIHJlYXNvbiA9IGBleHBlY3RlZCAke2Zvcm1hdFJlZmxlY3RMaXN0KGZpZWxkKX0sIGdvdCAke2Zvcm1hdFZhbCh2YWx1ZSl9YDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwibWFwXCI6XG4gICAgICAgICAgICByZWFzb24gPSBgZXhwZWN0ZWQgJHtmb3JtYXRSZWZsZWN0TWFwKGZpZWxkKX0sIGdvdCAke2Zvcm1hdFZhbCh2YWx1ZSl9YDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OiB7XG4gICAgICAgICAgICByZWFzb24gPSByZWFzb25TaW5ndWxhcihmaWVsZCwgdmFsdWUsIGNoZWNrKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbmV3IEZpZWxkRXJyb3IoZmllbGQsIHJlYXNvbik7XG59XG4vKipcbiAqIENoZWNrIHdoZXRoZXIgdGhlIGdpdmVuIGxpc3QgaXRlbSBpcyB2YWxpZCBmb3IgdGhlIHJlZmxlY3QgQVBJLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2hlY2tMaXN0SXRlbShmaWVsZCwgaW5kZXgsIHZhbHVlKSB7XG4gICAgY29uc3QgY2hlY2sgPSBjaGVja1Npbmd1bGFyKGZpZWxkLCB2YWx1ZSk7XG4gICAgaWYgKGNoZWNrICE9PSB0cnVlKSB7XG4gICAgICAgIHJldHVybiBuZXcgRmllbGRFcnJvcihmaWVsZCwgYGxpc3QgaXRlbSAjJHtpbmRleCArIDF9OiAke3JlYXNvblNpbmd1bGFyKGZpZWxkLCB2YWx1ZSwgY2hlY2spfWApO1xuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufVxuLyoqXG4gKiBDaGVjayB3aGV0aGVyIHRoZSBnaXZlbiBtYXAga2V5IGFuZCB2YWx1ZSBhcmUgdmFsaWQgZm9yIHRoZSByZWZsZWN0IEFQSS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNoZWNrTWFwRW50cnkoZmllbGQsIGtleSwgdmFsdWUpIHtcbiAgICBjb25zdCBjaGVja0tleSA9IGNoZWNrU2NhbGFyVmFsdWUoa2V5LCBmaWVsZC5tYXBLZXkpO1xuICAgIGlmIChjaGVja0tleSAhPT0gdHJ1ZSkge1xuICAgICAgICByZXR1cm4gbmV3IEZpZWxkRXJyb3IoZmllbGQsIGBpbnZhbGlkIG1hcCBrZXk6ICR7cmVhc29uU2luZ3VsYXIoeyBzY2FsYXI6IGZpZWxkLm1hcEtleSB9LCBrZXksIGNoZWNrS2V5KX1gKTtcbiAgICB9XG4gICAgY29uc3QgY2hlY2tWYWwgPSBjaGVja1Npbmd1bGFyKGZpZWxkLCB2YWx1ZSk7XG4gICAgaWYgKGNoZWNrVmFsICE9PSB0cnVlKSB7XG4gICAgICAgIHJldHVybiBuZXcgRmllbGRFcnJvcihmaWVsZCwgYG1hcCBlbnRyeSAke2Zvcm1hdFZhbChrZXkpfTogJHtyZWFzb25TaW5ndWxhcihmaWVsZCwgdmFsdWUsIGNoZWNrVmFsKX1gKTtcbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cbmZ1bmN0aW9uIGNoZWNrU2luZ3VsYXIoZmllbGQsIHZhbHVlKSB7XG4gICAgaWYgKGZpZWxkLnNjYWxhciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHJldHVybiBjaGVja1NjYWxhclZhbHVlKHZhbHVlLCBmaWVsZC5zY2FsYXIpO1xuICAgIH1cbiAgICBpZiAoZmllbGQuZW51bSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGlmIChmaWVsZC5lbnVtLm9wZW4pIHtcbiAgICAgICAgICAgIHJldHVybiBOdW1iZXIuaXNJbnRlZ2VyKHZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmllbGQuZW51bS52YWx1ZXMuc29tZSgodikgPT4gdi5udW1iZXIgPT09IHZhbHVlKTtcbiAgICB9XG4gICAgcmV0dXJuIGlzUmVmbGVjdE1lc3NhZ2UodmFsdWUsIGZpZWxkLm1lc3NhZ2UpO1xufVxuZnVuY3Rpb24gY2hlY2tTY2FsYXJWYWx1ZSh2YWx1ZSwgc2NhbGFyKSB7XG4gICAgc3dpdGNoIChzY2FsYXIpIHtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkRPVUJMRTpcbiAgICAgICAgICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT0gXCJudW1iZXJcIjtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZMT0FUOlxuICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPSBcIm51bWJlclwiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKE51bWJlci5pc05hTih2YWx1ZSkgfHwgIU51bWJlci5pc0Zpbml0ZSh2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWx1ZSA+IEZMT0FUMzJfTUFYIHx8IHZhbHVlIDwgRkxPQVQzMl9NSU4pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYCR7dmFsdWUudG9GaXhlZCgpfSBvdXQgb2YgcmFuZ2VgO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5JTlQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNGSVhFRDMyOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0lOVDMyOlxuICAgICAgICAgICAgLy8gc2lnbmVkXG4gICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlICE9PSBcIm51bWJlclwiIHx8ICFOdW1iZXIuaXNJbnRlZ2VyKHZhbHVlKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWx1ZSA+IElOVDMyX01BWCB8fCB2YWx1ZSA8IElOVDMyX01JTikge1xuICAgICAgICAgICAgICAgIHJldHVybiBgJHt2YWx1ZS50b0ZpeGVkKCl9IG91dCBvZiByYW5nZWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZJWEVEMzI6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5VSU5UMzI6XG4gICAgICAgICAgICAvLyB1bnNpZ25lZFxuICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJudW1iZXJcIiB8fCAhTnVtYmVyLmlzSW50ZWdlcih2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUgPiBVSU5UMzJfTUFYIHx8IHZhbHVlIDwgMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBgJHt2YWx1ZS50b0ZpeGVkKCl9IG91dCBvZiByYW5nZWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkJPT0w6XG4gICAgICAgICAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09IFwiYm9vbGVhblwiO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU1RSSU5HOlxuICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGdldFRleHRFbmNvZGluZygpLmNoZWNrVXRmOCh2YWx1ZSkgfHwgXCJpbnZhbGlkIFVURjhcIjtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkJZVEVTOlxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlIGluc3RhbmNlb2YgVWludDhBcnJheTtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLklOVDY0OlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0ZJWEVENjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TSU5UNjQ6XG4gICAgICAgICAgICAvLyBzaWduZWRcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT0gXCJiaWdpbnRcIiB8fFxuICAgICAgICAgICAgICAgIHR5cGVvZiB2YWx1ZSA9PSBcIm51bWJlclwiIHx8XG4gICAgICAgICAgICAgICAgKHR5cGVvZiB2YWx1ZSA9PSBcInN0cmluZ1wiICYmIHZhbHVlLmxlbmd0aCA+IDApKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgcHJvdG9JbnQ2NC5wYXJzZSh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXRjaCAoXykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYCR7dmFsdWV9IG91dCBvZiByYW5nZWA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRklYRUQ2NDpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlVJTlQ2NDpcbiAgICAgICAgICAgIC8vIHVuc2lnbmVkXG4gICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09IFwiYmlnaW50XCIgfHxcbiAgICAgICAgICAgICAgICB0eXBlb2YgdmFsdWUgPT0gXCJudW1iZXJcIiB8fFxuICAgICAgICAgICAgICAgICh0eXBlb2YgdmFsdWUgPT0gXCJzdHJpbmdcIiAmJiB2YWx1ZS5sZW5ndGggPiAwKSkge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHByb3RvSW50NjQudVBhcnNlKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhdGNoIChfKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBgJHt2YWx1ZX0gb3V0IG9mIHJhbmdlYDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufVxuZnVuY3Rpb24gcmVhc29uU2luZ3VsYXIoZmllbGQsIHZhbCwgZGV0YWlscykge1xuICAgIGRldGFpbHMgPVxuICAgICAgICB0eXBlb2YgZGV0YWlscyA9PSBcInN0cmluZ1wiID8gYDogJHtkZXRhaWxzfWAgOiBgLCBnb3QgJHtmb3JtYXRWYWwodmFsKX1gO1xuICAgIGlmIChmaWVsZC5zY2FsYXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gYGV4cGVjdGVkICR7c2NhbGFyVHlwZURlc2NyaXB0aW9uKGZpZWxkLnNjYWxhcil9YCArIGRldGFpbHM7XG4gICAgfVxuICAgIGlmIChmaWVsZC5lbnVtICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIGBleHBlY3RlZCAke2ZpZWxkLmVudW0udG9TdHJpbmcoKX1gICsgZGV0YWlscztcbiAgICB9XG4gICAgcmV0dXJuIGBleHBlY3RlZCAke2Zvcm1hdFJlZmxlY3RNZXNzYWdlKGZpZWxkLm1lc3NhZ2UpfWAgKyBkZXRhaWxzO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdFZhbCh2YWwpIHtcbiAgICBzd2l0Y2ggKHR5cGVvZiB2YWwpIHtcbiAgICAgICAgY2FzZSBcIm9iamVjdFwiOlxuICAgICAgICAgICAgaWYgKHZhbCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBcIm51bGxcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWwgaW5zdGFuY2VvZiBVaW50OEFycmF5KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGBVaW50OEFycmF5KCR7dmFsLmxlbmd0aH0pYDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHZhbCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYEFycmF5KCR7dmFsLmxlbmd0aH0pYDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpc1JlZmxlY3RMaXN0KHZhbCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZm9ybWF0UmVmbGVjdExpc3QodmFsLmZpZWxkKCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGlzUmVmbGVjdE1hcCh2YWwpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZvcm1hdFJlZmxlY3RNYXAodmFsLmZpZWxkKCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGlzUmVmbGVjdE1lc3NhZ2UodmFsKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmb3JtYXRSZWZsZWN0TWVzc2FnZSh2YWwuZGVzYyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaXNNZXNzYWdlKHZhbCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYG1lc3NhZ2UgJHt2YWwuJHR5cGVOYW1lfWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gXCJvYmplY3RcIjtcbiAgICAgICAgY2FzZSBcInN0cmluZ1wiOlxuICAgICAgICAgICAgcmV0dXJuIHZhbC5sZW5ndGggPiAzMCA/IFwic3RyaW5nXCIgOiBgXCIke3ZhbC5zcGxpdCgnXCInKS5qb2luKCdcXFxcXCInKX1cImA7XG4gICAgICAgIGNhc2UgXCJib29sZWFuXCI6XG4gICAgICAgICAgICByZXR1cm4gU3RyaW5nKHZhbCk7XG4gICAgICAgIGNhc2UgXCJudW1iZXJcIjpcbiAgICAgICAgICAgIHJldHVybiBTdHJpbmcodmFsKTtcbiAgICAgICAgY2FzZSBcImJpZ2ludFwiOlxuICAgICAgICAgICAgcmV0dXJuIFN0cmluZyh2YWwpICsgXCJuXCI7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAvLyBcInN5bWJvbFwiIHwgXCJ1bmRlZmluZWRcIiB8IFwib2JqZWN0XCIgfCBcImZ1bmN0aW9uXCJcbiAgICAgICAgICAgIHJldHVybiB0eXBlb2YgdmFsO1xuICAgIH1cbn1cbmZ1bmN0aW9uIGZvcm1hdFJlZmxlY3RNZXNzYWdlKGRlc2MpIHtcbiAgICByZXR1cm4gYFJlZmxlY3RNZXNzYWdlICgke2Rlc2MudHlwZU5hbWV9KWA7XG59XG5mdW5jdGlvbiBmb3JtYXRSZWZsZWN0TGlzdChmaWVsZCkge1xuICAgIHN3aXRjaCAoZmllbGQubGlzdEtpbmQpIHtcbiAgICAgICAgY2FzZSBcIm1lc3NhZ2VcIjpcbiAgICAgICAgICAgIHJldHVybiBgUmVmbGVjdExpc3QgKCR7ZmllbGQubWVzc2FnZS50b1N0cmluZygpfSlgO1xuICAgICAgICBjYXNlIFwiZW51bVwiOlxuICAgICAgICAgICAgcmV0dXJuIGBSZWZsZWN0TGlzdCAoJHtmaWVsZC5lbnVtLnRvU3RyaW5nKCl9KWA7XG4gICAgICAgIGNhc2UgXCJzY2FsYXJcIjpcbiAgICAgICAgICAgIHJldHVybiBgUmVmbGVjdExpc3QgKCR7U2NhbGFyVHlwZVtmaWVsZC5zY2FsYXJdfSlgO1xuICAgIH1cbn1cbmZ1bmN0aW9uIGZvcm1hdFJlZmxlY3RNYXAoZmllbGQpIHtcbiAgICBzd2l0Y2ggKGZpZWxkLm1hcEtpbmQpIHtcbiAgICAgICAgY2FzZSBcIm1lc3NhZ2VcIjpcbiAgICAgICAgICAgIHJldHVybiBgUmVmbGVjdE1hcCAoJHtTY2FsYXJUeXBlW2ZpZWxkLm1hcEtleV19LCAke2ZpZWxkLm1lc3NhZ2UudG9TdHJpbmcoKX0pYDtcbiAgICAgICAgY2FzZSBcImVudW1cIjpcbiAgICAgICAgICAgIHJldHVybiBgUmVmbGVjdE1hcCAoJHtTY2FsYXJUeXBlW2ZpZWxkLm1hcEtleV19LCAke2ZpZWxkLmVudW0udG9TdHJpbmcoKX0pYDtcbiAgICAgICAgY2FzZSBcInNjYWxhclwiOlxuICAgICAgICAgICAgcmV0dXJuIGBSZWZsZWN0TWFwICgke1NjYWxhclR5cGVbZmllbGQubWFwS2V5XX0sICR7U2NhbGFyVHlwZVtmaWVsZC5zY2FsYXJdfSlgO1xuICAgIH1cbn1cbmZ1bmN0aW9uIHNjYWxhclR5cGVEZXNjcmlwdGlvbihzY2FsYXIpIHtcbiAgICBzd2l0Y2ggKHNjYWxhcikge1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU1RSSU5HOlxuICAgICAgICAgICAgcmV0dXJuIFwic3RyaW5nXCI7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5CT09MOlxuICAgICAgICAgICAgcmV0dXJuIFwiYm9vbGVhblwiO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuSU5UNjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TSU5UNjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TRklYRUQ2NDpcbiAgICAgICAgICAgIHJldHVybiBcImJpZ2ludCAoaW50NjQpXCI7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5VSU5UNjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5GSVhFRDY0OlxuICAgICAgICAgICAgcmV0dXJuIFwiYmlnaW50ICh1aW50NjQpXCI7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5CWVRFUzpcbiAgICAgICAgICAgIHJldHVybiBcIlVpbnQ4QXJyYXlcIjtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkRPVUJMRTpcbiAgICAgICAgICAgIHJldHVybiBcIm51bWJlciAoZmxvYXQ2NClcIjtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZMT0FUOlxuICAgICAgICAgICAgcmV0dXJuIFwibnVtYmVyIChmbG9hdDMyKVwiO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRklYRUQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlVJTlQzMjpcbiAgICAgICAgICAgIHJldHVybiBcIm51bWJlciAodWludDMyKVwiO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuSU5UMzI6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TRklYRUQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNJTlQzMjpcbiAgICAgICAgICAgIHJldHVybiBcIm51bWJlciAoaW50MzIpXCI7XG4gICAgfVxufVxuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5pbXBvcnQgeyBTY2FsYXJUeXBlLCB9IGZyb20gXCIuLi9kZXNjcmlwdG9ycy5qc1wiO1xuaW1wb3J0IHsgY2hlY2tGaWVsZCwgY2hlY2tMaXN0SXRlbSwgY2hlY2tNYXBFbnRyeSB9IGZyb20gXCIuL3JlZmxlY3QtY2hlY2suanNcIjtcbmltcG9ydCB7IEZpZWxkRXJyb3IgfSBmcm9tIFwiLi9lcnJvci5qc1wiO1xuaW1wb3J0IHsgdW5zYWZlQ2xlYXIsIHVuc2FmZUdldCwgdW5zYWZlSXNTZXQsIHVuc2FmZUxvY2FsLCB1bnNhZmVPbmVvZkNhc2UsIHVuc2FmZVNldCwgfSBmcm9tIFwiLi91bnNhZmUuanNcIjtcbmltcG9ydCB7IGNyZWF0ZSB9IGZyb20gXCIuLi9jcmVhdGUuanNcIjtcbmltcG9ydCB7IGlzV3JhcHBlciwgaXNXcmFwcGVyRGVzYyB9IGZyb20gXCIuLi93a3Qvd3JhcHBlcnMuanNcIjtcbmltcG9ydCB7IHNjYWxhclplcm9WYWx1ZSB9IGZyb20gXCIuL3NjYWxhci5qc1wiO1xuaW1wb3J0IHsgcHJvdG9JbnQ2NCB9IGZyb20gXCIuLi9wcm90by1pbnQ2NC5qc1wiO1xuaW1wb3J0IHsgaXNPYmplY3QsIGlzUmVmbGVjdExpc3QsIGlzUmVmbGVjdE1hcCwgaXNSZWZsZWN0TWVzc2FnZSwgfSBmcm9tIFwiLi9ndWFyZC5qc1wiO1xuLyoqXG4gKiBDcmVhdGUgYSBSZWZsZWN0TWVzc2FnZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZmxlY3QobWVzc2FnZURlc2MsIG1lc3NhZ2UsIFxuLyoqXG4gKiBCeSBkZWZhdWx0LCBmaWVsZCB2YWx1ZXMgYXJlIHZhbGlkYXRlZCB3aGVuIHNldHRpbmcgdGhlbS4gRm9yIGV4YW1wbGUsXG4gKiBhIHZhbHVlIGZvciBhbiB1aW50MzIgZmllbGQgbXVzdCBiZSBhIEVDTUFTY3JpcHQgTnVtYmVyID49IDAuXG4gKlxuICogV2hlbiBmaWVsZCB2YWx1ZXMgYXJlIHRydXN0ZWQsIHBlcmZvcm1hbmNlIGNhbiBiZSBpbXByb3ZlZCBieSBkaXNhYmxpbmdcbiAqIGNoZWNrcy5cbiAqL1xuY2hlY2sgPSB0cnVlKSB7XG4gICAgcmV0dXJuIG5ldyBSZWZsZWN0TWVzc2FnZUltcGwobWVzc2FnZURlc2MsIG1lc3NhZ2UsIGNoZWNrKTtcbn1cbmNsYXNzIFJlZmxlY3RNZXNzYWdlSW1wbCB7XG4gICAgZ2V0IHNvcnRlZEZpZWxkcygpIHtcbiAgICAgICAgdmFyIF9hO1xuICAgICAgICByZXR1cm4gKChfYSA9IHRoaXMuX3NvcnRlZEZpZWxkcykgIT09IG51bGwgJiYgX2EgIT09IHZvaWQgMCA/IF9hIDogXG4gICAgICAgIC8vIGJpb21lLWlnbm9yZSBsaW50L3N1c3BpY2lvdXMvbm9Bc3NpZ25JbkV4cHJlc3Npb25zOiBub1xuICAgICAgICAodGhpcy5fc29ydGVkRmllbGRzID0gdGhpcy5kZXNjLmZpZWxkc1xuICAgICAgICAgICAgLmNvbmNhdCgpXG4gICAgICAgICAgICAuc29ydCgoYSwgYikgPT4gYS5udW1iZXIgLSBiLm51bWJlcikpKTtcbiAgICB9XG4gICAgY29uc3RydWN0b3IobWVzc2FnZURlc2MsIG1lc3NhZ2UsIGNoZWNrID0gdHJ1ZSkge1xuICAgICAgICB0aGlzLmxpc3RzID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLm1hcHMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMuY2hlY2sgPSBjaGVjaztcbiAgICAgICAgdGhpcy5kZXNjID0gbWVzc2FnZURlc2M7XG4gICAgICAgIHRoaXMubWVzc2FnZSA9IHRoaXNbdW5zYWZlTG9jYWxdID0gbWVzc2FnZSAhPT0gbnVsbCAmJiBtZXNzYWdlICE9PSB2b2lkIDAgPyBtZXNzYWdlIDogY3JlYXRlKG1lc3NhZ2VEZXNjKTtcbiAgICAgICAgdGhpcy5maWVsZHMgPSBtZXNzYWdlRGVzYy5maWVsZHM7XG4gICAgICAgIHRoaXMub25lb2ZzID0gbWVzc2FnZURlc2Mub25lb2ZzO1xuICAgICAgICB0aGlzLm1lbWJlcnMgPSBtZXNzYWdlRGVzYy5tZW1iZXJzO1xuICAgIH1cbiAgICBmaW5kTnVtYmVyKG51bWJlcikge1xuICAgICAgICBpZiAoIXRoaXMuX2ZpZWxkc0J5TnVtYmVyKSB7XG4gICAgICAgICAgICB0aGlzLl9maWVsZHNCeU51bWJlciA9IG5ldyBNYXAodGhpcy5kZXNjLmZpZWxkcy5tYXAoKGYpID0+IFtmLm51bWJlciwgZl0pKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5fZmllbGRzQnlOdW1iZXIuZ2V0KG51bWJlcik7XG4gICAgfVxuICAgIG9uZW9mQ2FzZShvbmVvZikge1xuICAgICAgICBhc3NlcnRPd24odGhpcy5tZXNzYWdlLCBvbmVvZik7XG4gICAgICAgIHJldHVybiB1bnNhZmVPbmVvZkNhc2UodGhpcy5tZXNzYWdlLCBvbmVvZik7XG4gICAgfVxuICAgIGlzU2V0KGZpZWxkKSB7XG4gICAgICAgIGFzc2VydE93bih0aGlzLm1lc3NhZ2UsIGZpZWxkKTtcbiAgICAgICAgcmV0dXJuIHVuc2FmZUlzU2V0KHRoaXMubWVzc2FnZSwgZmllbGQpO1xuICAgIH1cbiAgICBjbGVhcihmaWVsZCkge1xuICAgICAgICBhc3NlcnRPd24odGhpcy5tZXNzYWdlLCBmaWVsZCk7XG4gICAgICAgIHVuc2FmZUNsZWFyKHRoaXMubWVzc2FnZSwgZmllbGQpO1xuICAgIH1cbiAgICBnZXQoZmllbGQpIHtcbiAgICAgICAgYXNzZXJ0T3duKHRoaXMubWVzc2FnZSwgZmllbGQpO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IHVuc2FmZUdldCh0aGlzLm1lc3NhZ2UsIGZpZWxkKTtcbiAgICAgICAgc3dpdGNoIChmaWVsZC5maWVsZEtpbmQpIHtcbiAgICAgICAgICAgIGNhc2UgXCJsaXN0XCI6XG4gICAgICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNhc2UtZGVjbGFyYXRpb25zXG4gICAgICAgICAgICAgICAgbGV0IGxpc3QgPSB0aGlzLmxpc3RzLmdldChmaWVsZCk7XG4gICAgICAgICAgICAgICAgaWYgKCFsaXN0IHx8IGxpc3RbdW5zYWZlTG9jYWxdICE9PSB2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxpc3RzLnNldChmaWVsZCwgXG4gICAgICAgICAgICAgICAgICAgIC8vIGJpb21lLWlnbm9yZSBsaW50L3N1c3BpY2lvdXMvbm9Bc3NpZ25JbkV4cHJlc3Npb25zOiBub1xuICAgICAgICAgICAgICAgICAgICAobGlzdCA9IG5ldyBSZWZsZWN0TGlzdEltcGwoZmllbGQsIHZhbHVlLCB0aGlzLmNoZWNrKSkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gbGlzdDtcbiAgICAgICAgICAgIGNhc2UgXCJtYXBcIjpcbiAgICAgICAgICAgICAgICBsZXQgbWFwID0gdGhpcy5tYXBzLmdldChmaWVsZCk7XG4gICAgICAgICAgICAgICAgaWYgKCFtYXAgfHwgbWFwW3Vuc2FmZUxvY2FsXSAhPT0gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5tYXBzLnNldChmaWVsZCwgXG4gICAgICAgICAgICAgICAgICAgIC8vIGJpb21lLWlnbm9yZSBsaW50L3N1c3BpY2lvdXMvbm9Bc3NpZ25JbkV4cHJlc3Npb25zOiBub1xuICAgICAgICAgICAgICAgICAgICAobWFwID0gbmV3IFJlZmxlY3RNYXBJbXBsKGZpZWxkLCB2YWx1ZSwgdGhpcy5jaGVjaykpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1hcDtcbiAgICAgICAgICAgIGNhc2UgXCJtZXNzYWdlXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1lc3NhZ2VUb1JlZmxlY3QoZmllbGQsIHZhbHVlLCB0aGlzLmNoZWNrKTtcbiAgICAgICAgICAgIGNhc2UgXCJzY2FsYXJcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gKHZhbHVlID09PSB1bmRlZmluZWRcbiAgICAgICAgICAgICAgICAgICAgPyBzY2FsYXJaZXJvVmFsdWUoZmllbGQuc2NhbGFyLCBmYWxzZSlcbiAgICAgICAgICAgICAgICAgICAgOiBsb25nVG9SZWZsZWN0KGZpZWxkLCB2YWx1ZSkpO1xuICAgICAgICAgICAgY2FzZSBcImVudW1cIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gKHZhbHVlICE9PSBudWxsICYmIHZhbHVlICE9PSB2b2lkIDAgPyB2YWx1ZSA6IGZpZWxkLmVudW0udmFsdWVzWzBdLm51bWJlcik7XG4gICAgICAgIH1cbiAgICB9XG4gICAgc2V0KGZpZWxkLCB2YWx1ZSkge1xuICAgICAgICBhc3NlcnRPd24odGhpcy5tZXNzYWdlLCBmaWVsZCk7XG4gICAgICAgIGlmICh0aGlzLmNoZWNrKSB7XG4gICAgICAgICAgICBjb25zdCBlcnIgPSBjaGVja0ZpZWxkKGZpZWxkLCB2YWx1ZSk7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGxldCBsb2NhbDtcbiAgICAgICAgaWYgKGZpZWxkLmZpZWxkS2luZCA9PSBcIm1lc3NhZ2VcIikge1xuICAgICAgICAgICAgbG9jYWwgPSBtZXNzYWdlVG9Mb2NhbChmaWVsZCwgdmFsdWUpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGlzUmVmbGVjdE1hcCh2YWx1ZSkgfHwgaXNSZWZsZWN0TGlzdCh2YWx1ZSkpIHtcbiAgICAgICAgICAgIGxvY2FsID0gdmFsdWVbdW5zYWZlTG9jYWxdO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgbG9jYWwgPSBsb25nVG9Mb2NhbChmaWVsZCwgdmFsdWUpO1xuICAgICAgICB9XG4gICAgICAgIHVuc2FmZVNldCh0aGlzLm1lc3NhZ2UsIGZpZWxkLCBsb2NhbCk7XG4gICAgfVxuICAgIGdldFVua25vd24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLm1lc3NhZ2UuJHVua25vd247XG4gICAgfVxuICAgIHNldFVua25vd24odmFsdWUpIHtcbiAgICAgICAgdGhpcy5tZXNzYWdlLiR1bmtub3duID0gdmFsdWU7XG4gICAgfVxufVxuZnVuY3Rpb24gYXNzZXJ0T3duKG93bmVyLCBtZW1iZXIpIHtcbiAgICBpZiAobWVtYmVyLnBhcmVudC50eXBlTmFtZSAhPT0gb3duZXIuJHR5cGVOYW1lKSB7XG4gICAgICAgIHRocm93IG5ldyBGaWVsZEVycm9yKG1lbWJlciwgYGNhbm5vdCB1c2UgJHttZW1iZXIudG9TdHJpbmcoKX0gd2l0aCBtZXNzYWdlICR7b3duZXIuJHR5cGVOYW1lfWAsIFwiRm9yZWlnbkZpZWxkRXJyb3JcIik7XG4gICAgfVxufVxuLyoqXG4gKiBDcmVhdGUgYSBSZWZsZWN0TGlzdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZmxlY3RMaXN0KGZpZWxkLCB1bnNhZmVJbnB1dCwgXG4vKipcbiAqIEJ5IGRlZmF1bHQsIGZpZWxkIHZhbHVlcyBhcmUgdmFsaWRhdGVkIHdoZW4gc2V0dGluZyB0aGVtLiBGb3IgZXhhbXBsZSxcbiAqIGEgdmFsdWUgZm9yIGFuIHVpbnQzMiBmaWVsZCBtdXN0IGJlIGEgRUNNQVNjcmlwdCBOdW1iZXIgPj0gMC5cbiAqXG4gKiBXaGVuIGZpZWxkIHZhbHVlcyBhcmUgdHJ1c3RlZCwgcGVyZm9ybWFuY2UgY2FuIGJlIGltcHJvdmVkIGJ5IGRpc2FibGluZ1xuICogY2hlY2tzLlxuICovXG5jaGVjayA9IHRydWUpIHtcbiAgICByZXR1cm4gbmV3IFJlZmxlY3RMaXN0SW1wbChmaWVsZCwgdW5zYWZlSW5wdXQgIT09IG51bGwgJiYgdW5zYWZlSW5wdXQgIT09IHZvaWQgMCA/IHVuc2FmZUlucHV0IDogW10sIGNoZWNrKTtcbn1cbmNsYXNzIFJlZmxlY3RMaXN0SW1wbCB7XG4gICAgZmllbGQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9maWVsZDtcbiAgICB9XG4gICAgZ2V0IHNpemUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hcnIubGVuZ3RoO1xuICAgIH1cbiAgICBjb25zdHJ1Y3RvcihmaWVsZCwgdW5zYWZlSW5wdXQsIGNoZWNrKSB7XG4gICAgICAgIHRoaXMuX2ZpZWxkID0gZmllbGQ7XG4gICAgICAgIHRoaXMuX2FyciA9IHRoaXNbdW5zYWZlTG9jYWxdID0gdW5zYWZlSW5wdXQ7XG4gICAgICAgIHRoaXMuY2hlY2sgPSBjaGVjaztcbiAgICB9XG4gICAgZ2V0KGluZGV4KSB7XG4gICAgICAgIGNvbnN0IGl0ZW0gPSB0aGlzLl9hcnJbaW5kZXhdO1xuICAgICAgICByZXR1cm4gaXRlbSA9PT0gdW5kZWZpbmVkXG4gICAgICAgICAgICA/IHVuZGVmaW5lZFxuICAgICAgICAgICAgOiBsaXN0SXRlbVRvUmVmbGVjdCh0aGlzLl9maWVsZCwgaXRlbSwgdGhpcy5jaGVjayk7XG4gICAgfVxuICAgIHNldChpbmRleCwgaXRlbSkge1xuICAgICAgICBpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMuX2Fyci5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBGaWVsZEVycm9yKHRoaXMuX2ZpZWxkLCBgbGlzdCBpdGVtICMke2luZGV4ICsgMX06IG91dCBvZiByYW5nZWApO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmNoZWNrKSB7XG4gICAgICAgICAgICBjb25zdCBlcnIgPSBjaGVja0xpc3RJdGVtKHRoaXMuX2ZpZWxkLCBpbmRleCwgaXRlbSk7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2FycltpbmRleF0gPSBsaXN0SXRlbVRvTG9jYWwodGhpcy5fZmllbGQsIGl0ZW0pO1xuICAgIH1cbiAgICBhZGQoaXRlbSkge1xuICAgICAgICBpZiAodGhpcy5jaGVjaykge1xuICAgICAgICAgICAgY29uc3QgZXJyID0gY2hlY2tMaXN0SXRlbSh0aGlzLl9maWVsZCwgdGhpcy5fYXJyLmxlbmd0aCwgaXRlbSk7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2Fyci5wdXNoKGxpc3RJdGVtVG9Mb2NhbCh0aGlzLl9maWVsZCwgaXRlbSkpO1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICBjbGVhcigpIHtcbiAgICAgICAgdGhpcy5fYXJyLnNwbGljZSgwLCB0aGlzLl9hcnIubGVuZ3RoKTtcbiAgICB9XG4gICAgW1N5bWJvbC5pdGVyYXRvcl0oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnZhbHVlcygpO1xuICAgIH1cbiAgICBrZXlzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fYXJyLmtleXMoKTtcbiAgICB9XG4gICAgKnZhbHVlcygpIHtcbiAgICAgICAgZm9yIChjb25zdCBpdGVtIG9mIHRoaXMuX2Fycikge1xuICAgICAgICAgICAgeWllbGQgbGlzdEl0ZW1Ub1JlZmxlY3QodGhpcy5fZmllbGQsIGl0ZW0sIHRoaXMuY2hlY2spO1xuICAgICAgICB9XG4gICAgfVxuICAgICplbnRyaWVzKCkge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX2Fyci5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgeWllbGQgW2ksIGxpc3RJdGVtVG9SZWZsZWN0KHRoaXMuX2ZpZWxkLCB0aGlzLl9hcnJbaV0sIHRoaXMuY2hlY2spXTtcbiAgICAgICAgfVxuICAgIH1cbn1cbi8qKlxuICogQ3JlYXRlIGEgUmVmbGVjdE1hcC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZmxlY3RNYXAoZmllbGQsIHVuc2FmZUlucHV0LCBcbi8qKlxuICogQnkgZGVmYXVsdCwgZmllbGQgdmFsdWVzIGFyZSB2YWxpZGF0ZWQgd2hlbiBzZXR0aW5nIHRoZW0uIEZvciBleGFtcGxlLFxuICogYSB2YWx1ZSBmb3IgYW4gdWludDMyIGZpZWxkIG11c3QgYmUgYSBFQ01BU2NyaXB0IE51bWJlciA+PSAwLlxuICpcbiAqIFdoZW4gZmllbGQgdmFsdWVzIGFyZSB0cnVzdGVkLCBwZXJmb3JtYW5jZSBjYW4gYmUgaW1wcm92ZWQgYnkgZGlzYWJsaW5nXG4gKiBjaGVja3MuXG4gKi9cbmNoZWNrID0gdHJ1ZSkge1xuICAgIHJldHVybiBuZXcgUmVmbGVjdE1hcEltcGwoZmllbGQsIHVuc2FmZUlucHV0LCBjaGVjayk7XG59XG5jbGFzcyBSZWZsZWN0TWFwSW1wbCB7XG4gICAgY29uc3RydWN0b3IoZmllbGQsIHVuc2FmZUlucHV0LCBjaGVjayA9IHRydWUpIHtcbiAgICAgICAgdGhpcy5vYmogPSB0aGlzW3Vuc2FmZUxvY2FsXSA9IHVuc2FmZUlucHV0ICE9PSBudWxsICYmIHVuc2FmZUlucHV0ICE9PSB2b2lkIDAgPyB1bnNhZmVJbnB1dCA6IHt9O1xuICAgICAgICB0aGlzLmNoZWNrID0gY2hlY2s7XG4gICAgICAgIHRoaXMuX2ZpZWxkID0gZmllbGQ7XG4gICAgfVxuICAgIGZpZWxkKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZmllbGQ7XG4gICAgfVxuICAgIHNldChrZXksIHZhbHVlKSB7XG4gICAgICAgIGlmICh0aGlzLmNoZWNrKSB7XG4gICAgICAgICAgICBjb25zdCBlcnIgPSBjaGVja01hcEVudHJ5KHRoaXMuX2ZpZWxkLCBrZXksIHZhbHVlKTtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5vYmpbbWFwS2V5VG9Mb2NhbChrZXkpXSA9IG1hcFZhbHVlVG9Mb2NhbCh0aGlzLl9maWVsZCwgdmFsdWUpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgZGVsZXRlKGtleSkge1xuICAgICAgICBjb25zdCBrID0gbWFwS2V5VG9Mb2NhbChrZXkpO1xuICAgICAgICBjb25zdCBoYXMgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGhpcy5vYmosIGspO1xuICAgICAgICBpZiAoaGFzKSB7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5vYmpba107XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGhhcztcbiAgICB9XG4gICAgY2xlYXIoKSB7XG4gICAgICAgIGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHRoaXMub2JqKSkge1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMub2JqW2tleV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgZ2V0KGtleSkge1xuICAgICAgICBsZXQgdmFsID0gdGhpcy5vYmpbbWFwS2V5VG9Mb2NhbChrZXkpXTtcbiAgICAgICAgaWYgKHZhbCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB2YWwgPSBtYXBWYWx1ZVRvUmVmbGVjdCh0aGlzLl9maWVsZCwgdmFsLCB0aGlzLmNoZWNrKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdmFsO1xuICAgIH1cbiAgICBoYXMoa2V5KSB7XG4gICAgICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGhpcy5vYmosIG1hcEtleVRvTG9jYWwoa2V5KSk7XG4gICAgfVxuICAgICprZXlzKCkge1xuICAgICAgICBmb3IgKGNvbnN0IG9iaktleSBvZiBPYmplY3Qua2V5cyh0aGlzLm9iaikpIHtcbiAgICAgICAgICAgIHlpZWxkIG1hcEtleVRvUmVmbGVjdChvYmpLZXksIHRoaXMuX2ZpZWxkLm1hcEtleSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgKmVudHJpZXMoKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqRW50cnkgb2YgT2JqZWN0LmVudHJpZXModGhpcy5vYmopKSB7XG4gICAgICAgICAgICB5aWVsZCBbXG4gICAgICAgICAgICAgICAgbWFwS2V5VG9SZWZsZWN0KG9iakVudHJ5WzBdLCB0aGlzLl9maWVsZC5tYXBLZXkpLFxuICAgICAgICAgICAgICAgIG1hcFZhbHVlVG9SZWZsZWN0KHRoaXMuX2ZpZWxkLCBvYmpFbnRyeVsxXSwgdGhpcy5jaGVjayksXG4gICAgICAgICAgICBdO1xuICAgICAgICB9XG4gICAgfVxuICAgIFtTeW1ib2wuaXRlcmF0b3JdKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5lbnRyaWVzKCk7XG4gICAgfVxuICAgIGdldCBzaXplKCkge1xuICAgICAgICByZXR1cm4gT2JqZWN0LmtleXModGhpcy5vYmopLmxlbmd0aDtcbiAgICB9XG4gICAgKnZhbHVlcygpIHtcbiAgICAgICAgZm9yIChjb25zdCB2YWwgb2YgT2JqZWN0LnZhbHVlcyh0aGlzLm9iaikpIHtcbiAgICAgICAgICAgIHlpZWxkIG1hcFZhbHVlVG9SZWZsZWN0KHRoaXMuX2ZpZWxkLCB2YWwsIHRoaXMuY2hlY2spO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZvckVhY2goY2FsbGJhY2tmbiwgdGhpc0FyZykge1xuICAgICAgICBmb3IgKGNvbnN0IG1hcEVudHJ5IG9mIHRoaXMuZW50cmllcygpKSB7XG4gICAgICAgICAgICBjYWxsYmFja2ZuLmNhbGwodGhpc0FyZywgbWFwRW50cnlbMV0sIG1hcEVudHJ5WzBdLCB0aGlzKTtcbiAgICAgICAgfVxuICAgIH1cbn1cbmZ1bmN0aW9uIG1lc3NhZ2VUb0xvY2FsKGZpZWxkLCB2YWx1ZSkge1xuICAgIGlmICghaXNSZWZsZWN0TWVzc2FnZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cbiAgICBpZiAoaXNXcmFwcGVyKHZhbHVlLm1lc3NhZ2UpICYmXG4gICAgICAgICFmaWVsZC5vbmVvZiAmJlxuICAgICAgICBmaWVsZC5maWVsZEtpbmQgPT0gXCJtZXNzYWdlXCIpIHtcbiAgICAgICAgLy8gVHlwZXMgZnJvbSBnb29nbGUvcHJvdG9idWYvd3JhcHBlcnMucHJvdG8gYXJlIHVud3JhcHBlZCB3aGVuIHVzZWQgaW5cbiAgICAgICAgLy8gYSBzaW5ndWxhciBmaWVsZCB0aGF0IGlzIG5vdCBwYXJ0IG9mIGEgb25lb2YgZ3JvdXAuXG4gICAgICAgIHJldHVybiB2YWx1ZS5tZXNzYWdlLnZhbHVlO1xuICAgIH1cbiAgICBpZiAodmFsdWUuZGVzYy50eXBlTmFtZSA9PSBcImdvb2dsZS5wcm90b2J1Zi5TdHJ1Y3RcIiAmJlxuICAgICAgICBmaWVsZC5wYXJlbnQudHlwZU5hbWUgIT0gXCJnb29nbGUucHJvdG9idWYuVmFsdWVcIikge1xuICAgICAgICAvLyBnb29nbGUucHJvdG9idWYuU3RydWN0IGlzIHJlcHJlc2VudGVkIHdpdGggSnNvbk9iamVjdCB3aGVuIHVzZWQgaW4gYVxuICAgICAgICAvLyBmaWVsZCwgZXhjZXB0IHdoZW4gdXNlZCBpbiBnb29nbGUucHJvdG9idWYuVmFsdWUuXG4gICAgICAgIHJldHVybiB3a3RTdHJ1Y3RUb0xvY2FsKHZhbHVlLm1lc3NhZ2UpO1xuICAgIH1cbiAgICByZXR1cm4gdmFsdWUubWVzc2FnZTtcbn1cbmZ1bmN0aW9uIG1lc3NhZ2VUb1JlZmxlY3QoZmllbGQsIHZhbHVlLCBjaGVjaykge1xuICAgIGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGlmIChpc1dyYXBwZXJEZXNjKGZpZWxkLm1lc3NhZ2UpICYmXG4gICAgICAgICAgICAhZmllbGQub25lb2YgJiZcbiAgICAgICAgICAgIGZpZWxkLmZpZWxkS2luZCA9PSBcIm1lc3NhZ2VcIikge1xuICAgICAgICAgICAgLy8gVHlwZXMgZnJvbSBnb29nbGUvcHJvdG9idWYvd3JhcHBlcnMucHJvdG8gYXJlIHVud3JhcHBlZCB3aGVuIHVzZWQgaW5cbiAgICAgICAgICAgIC8vIGEgc2luZ3VsYXIgZmllbGQgdGhhdCBpcyBub3QgcGFydCBvZiBhIG9uZW9mIGdyb3VwLlxuICAgICAgICAgICAgdmFsdWUgPSB7XG4gICAgICAgICAgICAgICAgJHR5cGVOYW1lOiBmaWVsZC5tZXNzYWdlLnR5cGVOYW1lLFxuICAgICAgICAgICAgICAgIHZhbHVlOiBsb25nVG9SZWZsZWN0KGZpZWxkLm1lc3NhZ2UuZmllbGRzWzBdLCB2YWx1ZSksXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGZpZWxkLm1lc3NhZ2UudHlwZU5hbWUgPT0gXCJnb29nbGUucHJvdG9idWYuU3RydWN0XCIgJiZcbiAgICAgICAgICAgIGZpZWxkLnBhcmVudC50eXBlTmFtZSAhPSBcImdvb2dsZS5wcm90b2J1Zi5WYWx1ZVwiICYmXG4gICAgICAgICAgICBpc09iamVjdCh2YWx1ZSkpIHtcbiAgICAgICAgICAgIC8vIGdvb2dsZS5wcm90b2J1Zi5TdHJ1Y3QgaXMgcmVwcmVzZW50ZWQgd2l0aCBKc29uT2JqZWN0IHdoZW4gdXNlZCBpbiBhXG4gICAgICAgICAgICAvLyBmaWVsZCwgZXhjZXB0IHdoZW4gdXNlZCBpbiBnb29nbGUucHJvdG9idWYuVmFsdWUuXG4gICAgICAgICAgICB2YWx1ZSA9IHdrdFN0cnVjdFRvUmVmbGVjdCh2YWx1ZSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG5ldyBSZWZsZWN0TWVzc2FnZUltcGwoZmllbGQubWVzc2FnZSwgdmFsdWUsIGNoZWNrKTtcbn1cbmZ1bmN0aW9uIGxpc3RJdGVtVG9Mb2NhbChmaWVsZCwgdmFsdWUpIHtcbiAgICBpZiAoZmllbGQubGlzdEtpbmQgPT0gXCJtZXNzYWdlXCIpIHtcbiAgICAgICAgcmV0dXJuIG1lc3NhZ2VUb0xvY2FsKGZpZWxkLCB2YWx1ZSk7XG4gICAgfVxuICAgIHJldHVybiBsb25nVG9Mb2NhbChmaWVsZCwgdmFsdWUpO1xufVxuZnVuY3Rpb24gbGlzdEl0ZW1Ub1JlZmxlY3QoZmllbGQsIHZhbHVlLCBjaGVjaykge1xuICAgIGlmIChmaWVsZC5saXN0S2luZCA9PSBcIm1lc3NhZ2VcIikge1xuICAgICAgICByZXR1cm4gbWVzc2FnZVRvUmVmbGVjdChmaWVsZCwgdmFsdWUsIGNoZWNrKTtcbiAgICB9XG4gICAgcmV0dXJuIGxvbmdUb1JlZmxlY3QoZmllbGQsIHZhbHVlKTtcbn1cbmZ1bmN0aW9uIG1hcFZhbHVlVG9Mb2NhbChmaWVsZCwgdmFsdWUpIHtcbiAgICBpZiAoZmllbGQubWFwS2luZCA9PSBcIm1lc3NhZ2VcIikge1xuICAgICAgICByZXR1cm4gbWVzc2FnZVRvTG9jYWwoZmllbGQsIHZhbHVlKTtcbiAgICB9XG4gICAgcmV0dXJuIGxvbmdUb0xvY2FsKGZpZWxkLCB2YWx1ZSk7XG59XG5mdW5jdGlvbiBtYXBWYWx1ZVRvUmVmbGVjdChmaWVsZCwgdmFsdWUsIGNoZWNrKSB7XG4gICAgaWYgKGZpZWxkLm1hcEtpbmQgPT0gXCJtZXNzYWdlXCIpIHtcbiAgICAgICAgcmV0dXJuIG1lc3NhZ2VUb1JlZmxlY3QoZmllbGQsIHZhbHVlLCBjaGVjayk7XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZTtcbn1cbmZ1bmN0aW9uIG1hcEtleVRvTG9jYWwoa2V5KSB7XG4gICAgcmV0dXJuIHR5cGVvZiBrZXkgPT0gXCJzdHJpbmdcIiB8fCB0eXBlb2Yga2V5ID09IFwibnVtYmVyXCIgPyBrZXkgOiBTdHJpbmcoa2V5KTtcbn1cbi8qKlxuICogQ29udmVydHMgYSBtYXAga2V5IChhbnkgc2NhbGFyIHZhbHVlIGV4Y2VwdCBmbG9hdCwgZG91YmxlLCBvciBieXRlcykgZnJvbSBpdHNcbiAqIHJlcHJlc2VudGF0aW9uIGluIGEgbWVzc2FnZSAoc3RyaW5nIG9yIG51bWJlciwgdGhlIG9ubHkgcG9zc2libGUgb2JqZWN0IGtleVxuICogdHlwZXMpIHRvIHRoZSBjbG9zZXN0IHBvc3NpYmxlIHR5cGUgaW4gRUNNQVNjcmlwdC5cbiAqL1xuZnVuY3Rpb24gbWFwS2V5VG9SZWZsZWN0KGtleSwgdHlwZSkge1xuICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU1RSSU5HOlxuICAgICAgICAgICAgcmV0dXJuIGtleTtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLklOVDMyOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRklYRUQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlVJTlQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNGSVhFRDMyOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0lOVDMyOiB7XG4gICAgICAgICAgICBjb25zdCBuID0gTnVtYmVyLnBhcnNlSW50KGtleSk7XG4gICAgICAgICAgICBpZiAoTnVtYmVyLmlzRmluaXRlKG4pKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuQk9PTDpcbiAgICAgICAgICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICAgICAgICAgICAgY2FzZSBcInRydWVcIjpcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgY2FzZSBcImZhbHNlXCI6XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuVUlOVDY0OlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRklYRUQ2NDpcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHByb3RvSW50NjQudVBhcnNlKGtleSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXRjaCAoX2EpIHtcbiAgICAgICAgICAgICAgICAvL1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAvLyBJTlQ2NCwgU0ZJWEVENjQsIFNJTlQ2NFxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcHJvdG9JbnQ2NC5wYXJzZShrZXkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2ggKF9iKSB7XG4gICAgICAgICAgICAgICAgLy9cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4ga2V5O1xufVxuZnVuY3Rpb24gbG9uZ1RvUmVmbGVjdChmaWVsZCwgdmFsdWUpIHtcbiAgICBzd2l0Y2ggKGZpZWxkLnNjYWxhcikge1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuSU5UNjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TRklYRUQ2NDpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNJTlQ2NDpcbiAgICAgICAgICAgIGlmIChcImxvbmdBc1N0cmluZ1wiIGluIGZpZWxkICYmXG4gICAgICAgICAgICAgICAgZmllbGQubG9uZ0FzU3RyaW5nICYmXG4gICAgICAgICAgICAgICAgdHlwZW9mIHZhbHVlID09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHByb3RvSW50NjQucGFyc2UodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5GSVhFRDY0OlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuVUlOVDY0OlxuICAgICAgICAgICAgaWYgKFwibG9uZ0FzU3RyaW5nXCIgaW4gZmllbGQgJiZcbiAgICAgICAgICAgICAgICBmaWVsZC5sb25nQXNTdHJpbmcgJiZcbiAgICAgICAgICAgICAgICB0eXBlb2YgdmFsdWUgPT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIHZhbHVlID0gcHJvdG9JbnQ2NC51UGFyc2UodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZTtcbn1cbmZ1bmN0aW9uIGxvbmdUb0xvY2FsKGZpZWxkLCB2YWx1ZSkge1xuICAgIHN3aXRjaCAoZmllbGQuc2NhbGFyKSB7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5JTlQ2NDpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNGSVhFRDY0OlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0lOVDY0OlxuICAgICAgICAgICAgaWYgKFwibG9uZ0FzU3RyaW5nXCIgaW4gZmllbGQgJiYgZmllbGQubG9uZ0FzU3RyaW5nKSB7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSBTdHJpbmcodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAodHlwZW9mIHZhbHVlID09IFwic3RyaW5nXCIgfHwgdHlwZW9mIHZhbHVlID09IFwibnVtYmVyXCIpIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHByb3RvSW50NjQucGFyc2UodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5GSVhFRDY0OlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuVUlOVDY0OlxuICAgICAgICAgICAgaWYgKFwibG9uZ0FzU3RyaW5nXCIgaW4gZmllbGQgJiYgZmllbGQubG9uZ0FzU3RyaW5nKSB7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSBTdHJpbmcodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAodHlwZW9mIHZhbHVlID09IFwic3RyaW5nXCIgfHwgdHlwZW9mIHZhbHVlID09IFwibnVtYmVyXCIpIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHByb3RvSW50NjQudVBhcnNlKHZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4gdmFsdWU7XG59XG5mdW5jdGlvbiB3a3RTdHJ1Y3RUb1JlZmxlY3QoanNvbikge1xuICAgIGNvbnN0IHN0cnVjdCA9IHtcbiAgICAgICAgJHR5cGVOYW1lOiBcImdvb2dsZS5wcm90b2J1Zi5TdHJ1Y3RcIixcbiAgICAgICAgZmllbGRzOiB7fSxcbiAgICB9O1xuICAgIGlmIChpc09iamVjdChqc29uKSkge1xuICAgICAgICBmb3IgKGNvbnN0IFtrLCB2XSBvZiBPYmplY3QuZW50cmllcyhqc29uKSkge1xuICAgICAgICAgICAgc3RydWN0LmZpZWxkc1trXSA9IHdrdFZhbHVlVG9SZWZsZWN0KHYpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBzdHJ1Y3Q7XG59XG5mdW5jdGlvbiB3a3RTdHJ1Y3RUb0xvY2FsKHZhbCkge1xuICAgIGNvbnN0IGpzb24gPSB7fTtcbiAgICBmb3IgKGNvbnN0IFtrLCB2XSBvZiBPYmplY3QuZW50cmllcyh2YWwuZmllbGRzKSkge1xuICAgICAgICBqc29uW2tdID0gd2t0VmFsdWVUb0xvY2FsKHYpO1xuICAgIH1cbiAgICByZXR1cm4ganNvbjtcbn1cbmZ1bmN0aW9uIHdrdFZhbHVlVG9Mb2NhbCh2YWwpIHtcbiAgICBzd2l0Y2ggKHZhbC5raW5kLmNhc2UpIHtcbiAgICAgICAgY2FzZSBcInN0cnVjdFZhbHVlXCI6XG4gICAgICAgICAgICByZXR1cm4gd2t0U3RydWN0VG9Mb2NhbCh2YWwua2luZC52YWx1ZSk7XG4gICAgICAgIGNhc2UgXCJsaXN0VmFsdWVcIjpcbiAgICAgICAgICAgIHJldHVybiB2YWwua2luZC52YWx1ZS52YWx1ZXMubWFwKHdrdFZhbHVlVG9Mb2NhbCk7XG4gICAgICAgIGNhc2UgXCJudWxsVmFsdWVcIjpcbiAgICAgICAgY2FzZSB1bmRlZmluZWQ6XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiB2YWwua2luZC52YWx1ZTtcbiAgICB9XG59XG5mdW5jdGlvbiB3a3RWYWx1ZVRvUmVmbGVjdChqc29uKSB7XG4gICAgY29uc3QgdmFsdWUgPSB7XG4gICAgICAgICR0eXBlTmFtZTogXCJnb29nbGUucHJvdG9idWYuVmFsdWVcIixcbiAgICAgICAga2luZDogeyBjYXNlOiB1bmRlZmluZWQgfSxcbiAgICB9O1xuICAgIHN3aXRjaCAodHlwZW9mIGpzb24pIHtcbiAgICAgICAgY2FzZSBcIm51bWJlclwiOlxuICAgICAgICAgICAgdmFsdWUua2luZCA9IHsgY2FzZTogXCJudW1iZXJWYWx1ZVwiLCB2YWx1ZToganNvbiB9O1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJzdHJpbmdcIjpcbiAgICAgICAgICAgIHZhbHVlLmtpbmQgPSB7IGNhc2U6IFwic3RyaW5nVmFsdWVcIiwgdmFsdWU6IGpzb24gfTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiYm9vbGVhblwiOlxuICAgICAgICAgICAgdmFsdWUua2luZCA9IHsgY2FzZTogXCJib29sVmFsdWVcIiwgdmFsdWU6IGpzb24gfTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwib2JqZWN0XCI6XG4gICAgICAgICAgICBpZiAoanNvbiA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG51bGxWYWx1ZSA9IDA7XG4gICAgICAgICAgICAgICAgdmFsdWUua2luZCA9IHsgY2FzZTogXCJudWxsVmFsdWVcIiwgdmFsdWU6IG51bGxWYWx1ZSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoQXJyYXkuaXNBcnJheShqc29uKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGxpc3RWYWx1ZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgJHR5cGVOYW1lOiBcImdvb2dsZS5wcm90b2J1Zi5MaXN0VmFsdWVcIixcbiAgICAgICAgICAgICAgICAgICAgdmFsdWVzOiBbXSxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KGpzb24pKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgZSBvZiBqc29uKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsaXN0VmFsdWUudmFsdWVzLnB1c2god2t0VmFsdWVUb1JlZmxlY3QoZSkpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHZhbHVlLmtpbmQgPSB7XG4gICAgICAgICAgICAgICAgICAgIGNhc2U6IFwibGlzdFZhbHVlXCIsXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiBsaXN0VmFsdWUsXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhbHVlLmtpbmQgPSB7XG4gICAgICAgICAgICAgICAgICAgIGNhc2U6IFwic3RydWN0VmFsdWVcIixcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHdrdFN0cnVjdFRvUmVmbGVjdChqc29uKSxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZTtcbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuaW1wb3J0IHsgU2NhbGFyVHlwZSB9IGZyb20gXCIuL2Rlc2NyaXB0b3JzLmpzXCI7XG5pbXBvcnQgeyByZWZsZWN0IH0gZnJvbSBcIi4vcmVmbGVjdC9yZWZsZWN0LmpzXCI7XG5pbXBvcnQgeyBpc1JlZmxlY3RNZXNzYWdlIH0gZnJvbSBcIi4vcmVmbGVjdC9ndWFyZC5qc1wiO1xuLyoqXG4gKiBDcmVhdGUgYSBkZWVwIGNvcHkgb2YgYSBtZXNzYWdlLCBpbmNsdWRpbmcgZXh0ZW5zaW9ucyBhbmQgdW5rbm93biBmaWVsZHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjbG9uZShzY2hlbWEsIG1lc3NhZ2UpIHtcbiAgICByZXR1cm4gY2xvbmVSZWZsZWN0KHJlZmxlY3Qoc2NoZW1hLCBtZXNzYWdlKSkubWVzc2FnZTtcbn1cbmZ1bmN0aW9uIGNsb25lUmVmbGVjdChpKSB7XG4gICAgY29uc3QgbyA9IHJlZmxlY3QoaS5kZXNjKTtcbiAgICBmb3IgKGNvbnN0IGYgb2YgaS5maWVsZHMpIHtcbiAgICAgICAgaWYgKCFpLmlzU2V0KGYpKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBzd2l0Y2ggKGYuZmllbGRLaW5kKSB7XG4gICAgICAgICAgICBjYXNlIFwibGlzdFwiOlxuICAgICAgICAgICAgICAgIGNvbnN0IGxpc3QgPSBvLmdldChmKTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgaS5nZXQoZikpIHtcbiAgICAgICAgICAgICAgICAgICAgbGlzdC5hZGQoY2xvbmVTaW5ndWxhcihmLCBpdGVtKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcIm1hcFwiOlxuICAgICAgICAgICAgICAgIGNvbnN0IG1hcCA9IG8uZ2V0KGYpO1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgaS5nZXQoZikuZW50cmllcygpKSB7XG4gICAgICAgICAgICAgICAgICAgIG1hcC5zZXQoZW50cnlbMF0sIGNsb25lU2luZ3VsYXIoZiwgZW50cnlbMV0pKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OiB7XG4gICAgICAgICAgICAgICAgby5zZXQoZiwgY2xvbmVTaW5ndWxhcihmLCBpLmdldChmKSkpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHVua25vd24gPSBpLmdldFVua25vd24oKTtcbiAgICBpZiAodW5rbm93biAmJiB1bmtub3duLmxlbmd0aCA+IDApIHtcbiAgICAgICAgby5zZXRVbmtub3duKFsuLi51bmtub3duXSk7XG4gICAgfVxuICAgIHJldHVybiBvO1xufVxuZnVuY3Rpb24gY2xvbmVTaW5ndWxhcihmaWVsZCwgdmFsdWUpIHtcbiAgICBpZiAoZmllbGQubWVzc2FnZSAhPT0gdW5kZWZpbmVkICYmIGlzUmVmbGVjdE1lc3NhZ2UodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiBjbG9uZVJlZmxlY3QodmFsdWUpO1xuICAgIH1cbiAgICBpZiAoZmllbGQuc2NhbGFyID09IFNjYWxhclR5cGUuQllURVMgJiYgdmFsdWUgaW5zdGFuY2VvZiBVaW50OEFycmF5KSB7XG4gICAgICAgIC8vIEB0cy1leHBlY3QtZXJyb3IgVCBjYW5ub3QgZXh0ZW5kIFVpbnQ4QXJyYXkgaW4gcHJhY3RpY2VcbiAgICAgICAgcmV0dXJuIHZhbHVlLnNsaWNlKCk7XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZTtcbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuLyoqXG4gKiBEZWNvZGVzIGEgYmFzZTY0IHN0cmluZyB0byBhIGJ5dGUgYXJyYXkuXG4gKlxuICogLSBpZ25vcmVzIHdoaXRlLXNwYWNlLCBpbmNsdWRpbmcgbGluZSBicmVha3MgYW5kIHRhYnNcbiAqIC0gYWxsb3dzIGlubmVyIHBhZGRpbmcgKGNhbiBkZWNvZGUgY29uY2F0ZW5hdGVkIGJhc2U2NCBzdHJpbmdzKVxuICogLSBkb2VzIG5vdCByZXF1aXJlIHBhZGRpbmdcbiAqIC0gdW5kZXJzdGFuZHMgYmFzZTY0dXJsIGVuY29kaW5nOlxuICogICBcIi1cIiBpbnN0ZWFkIG9mIFwiK1wiLFxuICogICBcIl9cIiBpbnN0ZWFkIG9mIFwiL1wiLFxuICogICBubyBwYWRkaW5nXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlNjREZWNvZGUoYmFzZTY0U3RyKSB7XG4gICAgY29uc3QgdGFibGUgPSBnZXREZWNvZGVUYWJsZSgpO1xuICAgIC8vIGVzdGltYXRlIGJ5dGUgc2l6ZSwgbm90IGFjY291bnRpbmcgZm9yIGlubmVyIHBhZGRpbmcgYW5kIHdoaXRlc3BhY2VcbiAgICBsZXQgZXMgPSAoYmFzZTY0U3RyLmxlbmd0aCAqIDMpIC8gNDtcbiAgICBpZiAoYmFzZTY0U3RyW2Jhc2U2NFN0ci5sZW5ndGggLSAyXSA9PSBcIj1cIilcbiAgICAgICAgZXMgLT0gMjtcbiAgICBlbHNlIGlmIChiYXNlNjRTdHJbYmFzZTY0U3RyLmxlbmd0aCAtIDFdID09IFwiPVwiKVxuICAgICAgICBlcyAtPSAxO1xuICAgIGxldCBieXRlcyA9IG5ldyBVaW50OEFycmF5KGVzKSwgYnl0ZVBvcyA9IDAsIC8vIHBvc2l0aW9uIGluIGJ5dGUgYXJyYXlcbiAgICBncm91cFBvcyA9IDAsIC8vIHBvc2l0aW9uIGluIGJhc2U2NCBncm91cFxuICAgIGIsIC8vIGN1cnJlbnQgYnl0ZVxuICAgIHAgPSAwOyAvLyBwcmV2aW91cyBieXRlXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBiYXNlNjRTdHIubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYiA9IHRhYmxlW2Jhc2U2NFN0ci5jaGFyQ29kZUF0KGkpXTtcbiAgICAgICAgaWYgKGIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgc3dpdGNoIChiYXNlNjRTdHJbaV0pIHtcbiAgICAgICAgICAgICAgICAvLyBAdHMtaWdub3JlIFRTNzAyOTogRmFsbHRocm91Z2ggY2FzZSBpbiBzd2l0Y2ggLS0gaWdub3JlIGluc3RlYWQgb2YgZXhwZWN0LWVycm9yIGZvciBjb21waWxlciBzZXR0aW5ncyB3aXRob3V0IG5vRmFsbHRocm91Z2hDYXNlc0luU3dpdGNoOiB0cnVlXG4gICAgICAgICAgICAgICAgY2FzZSBcIj1cIjpcbiAgICAgICAgICAgICAgICAgICAgZ3JvdXBQb3MgPSAwOyAvLyByZXNldCBzdGF0ZSB3aGVuIHBhZGRpbmcgZm91bmRcbiAgICAgICAgICAgICAgICBjYXNlIFwiXFxuXCI6XG4gICAgICAgICAgICAgICAgY2FzZSBcIlxcclwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCJcXHRcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwiIFwiOlxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTsgLy8gc2tpcCB3aGl0ZS1zcGFjZSwgYW5kIHBhZGRpbmdcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBFcnJvcihcImludmFsaWQgYmFzZTY0IHN0cmluZ1wiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBzd2l0Y2ggKGdyb3VwUG9zKSB7XG4gICAgICAgICAgICBjYXNlIDA6XG4gICAgICAgICAgICAgICAgcCA9IGI7XG4gICAgICAgICAgICAgICAgZ3JvdXBQb3MgPSAxO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAxOlxuICAgICAgICAgICAgICAgIGJ5dGVzW2J5dGVQb3MrK10gPSAocCA8PCAyKSB8ICgoYiAmIDQ4KSA+PiA0KTtcbiAgICAgICAgICAgICAgICBwID0gYjtcbiAgICAgICAgICAgICAgICBncm91cFBvcyA9IDI7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDI6XG4gICAgICAgICAgICAgICAgYnl0ZXNbYnl0ZVBvcysrXSA9ICgocCAmIDE1KSA8PCA0KSB8ICgoYiAmIDYwKSA+PiAyKTtcbiAgICAgICAgICAgICAgICBwID0gYjtcbiAgICAgICAgICAgICAgICBncm91cFBvcyA9IDM7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDM6XG4gICAgICAgICAgICAgICAgYnl0ZXNbYnl0ZVBvcysrXSA9ICgocCAmIDMpIDw8IDYpIHwgYjtcbiAgICAgICAgICAgICAgICBncm91cFBvcyA9IDA7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKGdyb3VwUG9zID09IDEpXG4gICAgICAgIHRocm93IEVycm9yKFwiaW52YWxpZCBiYXNlNjQgc3RyaW5nXCIpO1xuICAgIHJldHVybiBieXRlcy5zdWJhcnJheSgwLCBieXRlUG9zKTtcbn1cbi8qKlxuICogRW5jb2RlIGEgYnl0ZSBhcnJheSB0byBhIGJhc2U2NCBzdHJpbmcuXG4gKlxuICogQnkgZGVmYXVsdCwgdGhpcyBmdW5jdGlvbiB1c2VzIHRoZSBzdGFuZGFyZCBiYXNlNjQgZW5jb2Rpbmcgd2l0aCBwYWRkaW5nLlxuICpcbiAqIFRvIGVuY29kZSB3aXRob3V0IHBhZGRpbmcsIHVzZSBlbmNvZGluZyA9IFwic3RkX3Jhd1wiLlxuICpcbiAqIFRvIGVuY29kZSB3aXRoIHRoZSBVUkwgZW5jb2RpbmcsIHVzZSBlbmNvZGluZyA9IFwidXJsXCIsIHdoaWNoIHJlcGxhY2VzIHRoZVxuICogY2hhcmFjdGVycyArLyBieSB0aGVpciBVUkwtc2FmZSBjb3VudGVycGFydHMgLV8sIGFuZCBvbWl0cyBwYWRkaW5nLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYmFzZTY0RW5jb2RlKGJ5dGVzLCBlbmNvZGluZyA9IFwic3RkXCIpIHtcbiAgICBjb25zdCB0YWJsZSA9IGdldEVuY29kZVRhYmxlKGVuY29kaW5nKTtcbiAgICBjb25zdCBwYWQgPSBlbmNvZGluZyA9PSBcInN0ZFwiO1xuICAgIGxldCBiYXNlNjQgPSBcIlwiLCBncm91cFBvcyA9IDAsIC8vIHBvc2l0aW9uIGluIGJhc2U2NCBncm91cFxuICAgIGIsIC8vIGN1cnJlbnQgYnl0ZVxuICAgIHAgPSAwOyAvLyBjYXJyeSBvdmVyIGZyb20gcHJldmlvdXMgYnl0ZVxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYnl0ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYiA9IGJ5dGVzW2ldO1xuICAgICAgICBzd2l0Y2ggKGdyb3VwUG9zKSB7XG4gICAgICAgICAgICBjYXNlIDA6XG4gICAgICAgICAgICAgICAgYmFzZTY0ICs9IHRhYmxlW2IgPj4gMl07XG4gICAgICAgICAgICAgICAgcCA9IChiICYgMykgPDwgNDtcbiAgICAgICAgICAgICAgICBncm91cFBvcyA9IDE7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDE6XG4gICAgICAgICAgICAgICAgYmFzZTY0ICs9IHRhYmxlW3AgfCAoYiA+PiA0KV07XG4gICAgICAgICAgICAgICAgcCA9IChiICYgMTUpIDw8IDI7XG4gICAgICAgICAgICAgICAgZ3JvdXBQb3MgPSAyO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAyOlxuICAgICAgICAgICAgICAgIGJhc2U2NCArPSB0YWJsZVtwIHwgKGIgPj4gNildO1xuICAgICAgICAgICAgICAgIGJhc2U2NCArPSB0YWJsZVtiICYgNjNdO1xuICAgICAgICAgICAgICAgIGdyb3VwUG9zID0gMDtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cbiAgICAvLyBhZGQgb3V0cHV0IHBhZGRpbmdcbiAgICBpZiAoZ3JvdXBQb3MpIHtcbiAgICAgICAgYmFzZTY0ICs9IHRhYmxlW3BdO1xuICAgICAgICBpZiAocGFkKSB7XG4gICAgICAgICAgICBiYXNlNjQgKz0gXCI9XCI7XG4gICAgICAgICAgICBpZiAoZ3JvdXBQb3MgPT0gMSlcbiAgICAgICAgICAgICAgICBiYXNlNjQgKz0gXCI9XCI7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGJhc2U2NDtcbn1cbi8vIGxvb2t1cCB0YWJsZSBmcm9tIGJhc2U2NCBjaGFyYWN0ZXIgdG8gYnl0ZVxubGV0IGVuY29kZVRhYmxlU3RkO1xubGV0IGVuY29kZVRhYmxlVXJsO1xuLy8gbG9va3VwIHRhYmxlIGZyb20gYmFzZTY0IGNoYXJhY3RlciAqY29kZSogdG8gYnl0ZSBiZWNhdXNlIGxvb2t1cCBieSBudW1iZXIgaXMgZmFzdFxubGV0IGRlY29kZVRhYmxlO1xuZnVuY3Rpb24gZ2V0RW5jb2RlVGFibGUoZW5jb2RpbmcpIHtcbiAgICBpZiAoIWVuY29kZVRhYmxlU3RkKSB7XG4gICAgICAgIGVuY29kZVRhYmxlU3RkID1cbiAgICAgICAgICAgIFwiQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrL1wiLnNwbGl0KFwiXCIpO1xuICAgICAgICBlbmNvZGVUYWJsZVVybCA9IGVuY29kZVRhYmxlU3RkLnNsaWNlKDAsIC0yKS5jb25jYXQoXCItXCIsIFwiX1wiKTtcbiAgICB9XG4gICAgcmV0dXJuIGVuY29kaW5nID09IFwidXJsXCJcbiAgICAgICAgPyAvLyBiaW9tZS1pZ25vcmUgbGludC9zdHlsZS9ub05vbk51bGxBc3NlcnRpb246IFRTIGZhaWxzIHRvIG5hcnJvdyBkb3duXG4gICAgICAgICAgICBlbmNvZGVUYWJsZVVybFxuICAgICAgICA6IGVuY29kZVRhYmxlU3RkO1xufVxuZnVuY3Rpb24gZ2V0RGVjb2RlVGFibGUoKSB7XG4gICAgaWYgKCFkZWNvZGVUYWJsZSkge1xuICAgICAgICBkZWNvZGVUYWJsZSA9IFtdO1xuICAgICAgICBjb25zdCBlbmNvZGVUYWJsZSA9IGdldEVuY29kZVRhYmxlKFwic3RkXCIpO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGVuY29kZVRhYmxlLmxlbmd0aDsgaSsrKVxuICAgICAgICAgICAgZGVjb2RlVGFibGVbZW5jb2RlVGFibGVbaV0uY2hhckNvZGVBdCgwKV0gPSBpO1xuICAgICAgICAvLyBzdXBwb3J0IGJhc2U2NHVybCB2YXJpYW50c1xuICAgICAgICBkZWNvZGVUYWJsZVtcIi1cIi5jaGFyQ29kZUF0KDApXSA9IGVuY29kZVRhYmxlLmluZGV4T2YoXCIrXCIpO1xuICAgICAgICBkZWNvZGVUYWJsZVtcIl9cIi5jaGFyQ29kZUF0KDApXSA9IGVuY29kZVRhYmxlLmluZGV4T2YoXCIvXCIpO1xuICAgIH1cbiAgICByZXR1cm4gZGVjb2RlVGFibGU7XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbi8qKlxuICogUmV0dXJuIGEgZnVsbHktcXVhbGlmaWVkIG5hbWUgZm9yIGEgUHJvdG9idWYgZGVzY3JpcHRvci5cbiAqIEZvciBhIGZpbGUgZGVzY3JpcHRvciwgcmV0dXJuIHRoZSBvcmlnaW5hbCBmaWxlIHBhdGguXG4gKlxuICogU2VlIGh0dHBzOi8vcHJvdG9idWYuY29tL2RvY3MvbGFuZ3VhZ2Utc3BlYyNmdWxseS1xdWFsaWZpZWQtbmFtZXNcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHF1YWxpZmllZE5hbWUoZGVzYykge1xuICAgIHN3aXRjaCAoZGVzYy5raW5kKSB7XG4gICAgICAgIGNhc2UgXCJmaWVsZFwiOlxuICAgICAgICBjYXNlIFwib25lb2ZcIjpcbiAgICAgICAgY2FzZSBcInJwY1wiOlxuICAgICAgICAgICAgcmV0dXJuIGRlc2MucGFyZW50LnR5cGVOYW1lICsgXCIuXCIgKyBkZXNjLm5hbWU7XG4gICAgICAgIGNhc2UgXCJlbnVtX3ZhbHVlXCI6IHtcbiAgICAgICAgICAgIGNvbnN0IHAgPSBkZXNjLnBhcmVudC5wYXJlbnRcbiAgICAgICAgICAgICAgICA/IGRlc2MucGFyZW50LnBhcmVudC50eXBlTmFtZVxuICAgICAgICAgICAgICAgIDogZGVzYy5wYXJlbnQuZmlsZS5wcm90by5wYWNrYWdlO1xuICAgICAgICAgICAgcmV0dXJuIHAgKyAocC5sZW5ndGggPiAwID8gXCIuXCIgOiBcIlwiKSArIGRlc2MubmFtZTtcbiAgICAgICAgfVxuICAgICAgICBjYXNlIFwic2VydmljZVwiOlxuICAgICAgICBjYXNlIFwibWVzc2FnZVwiOlxuICAgICAgICBjYXNlIFwiZW51bVwiOlxuICAgICAgICBjYXNlIFwiZXh0ZW5zaW9uXCI6XG4gICAgICAgICAgICByZXR1cm4gZGVzYy50eXBlTmFtZTtcbiAgICAgICAgY2FzZSBcImZpbGVcIjpcbiAgICAgICAgICAgIHJldHVybiBkZXNjLnByb3RvLm5hbWU7XG4gICAgfVxufVxuLyoqXG4gKiBDb252ZXJ0cyBzbmFrZV9jYXNlIHRvIHByb3RvQ2FtZWxDYXNlIGFjY29yZGluZyB0byB0aGUgY29udmVudGlvblxuICogdXNlZCBieSBwcm90b2MgdG8gY29udmVydCBhIGZpZWxkIG5hbWUgdG8gYSBKU09OIG5hbWUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcm90b0NhbWVsQ2FzZShzbmFrZUNhc2UpIHtcbiAgICBsZXQgY2FwTmV4dCA9IGZhbHNlO1xuICAgIGNvbnN0IGIgPSBbXTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNuYWtlQ2FzZS5sZW5ndGg7IGkrKykge1xuICAgICAgICBsZXQgYyA9IHNuYWtlQ2FzZS5jaGFyQXQoaSk7XG4gICAgICAgIHN3aXRjaCAoYykge1xuICAgICAgICAgICAgY2FzZSBcIl9cIjpcbiAgICAgICAgICAgICAgICBjYXBOZXh0ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCIwXCI6XG4gICAgICAgICAgICBjYXNlIFwiMVwiOlxuICAgICAgICAgICAgY2FzZSBcIjJcIjpcbiAgICAgICAgICAgIGNhc2UgXCIzXCI6XG4gICAgICAgICAgICBjYXNlIFwiNFwiOlxuICAgICAgICAgICAgY2FzZSBcIjVcIjpcbiAgICAgICAgICAgIGNhc2UgXCI2XCI6XG4gICAgICAgICAgICBjYXNlIFwiN1wiOlxuICAgICAgICAgICAgY2FzZSBcIjhcIjpcbiAgICAgICAgICAgIGNhc2UgXCI5XCI6XG4gICAgICAgICAgICAgICAgYi5wdXNoKGMpO1xuICAgICAgICAgICAgICAgIGNhcE5leHQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgaWYgKGNhcE5leHQpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FwTmV4dCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBjID0gYy50b1VwcGVyQ2FzZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBiLnB1c2goYyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGIuam9pbihcIlwiKTtcbn1cbi8qKlxuICogTmFtZXMgdGhhdCBjYW5ub3QgYmUgdXNlZCBmb3Igb2JqZWN0IHByb3BlcnRpZXMgYmVjYXVzZSB0aGV5IGFyZSByZXNlcnZlZFxuICogYnkgYnVpbHQtaW4gSmF2YVNjcmlwdCBwcm9wZXJ0aWVzLlxuICovXG5jb25zdCByZXNlcnZlZE9iamVjdFByb3BlcnRpZXMgPSBuZXcgU2V0KFtcbiAgICAvLyBuYW1lcyByZXNlcnZlZCBieSBKYXZhU2NyaXB0XG4gICAgXCJjb25zdHJ1Y3RvclwiLFxuICAgIFwidG9TdHJpbmdcIixcbiAgICBcInRvSlNPTlwiLFxuICAgIFwidmFsdWVPZlwiLFxuXSk7XG4vKipcbiAqIEVzY2FwZXMgbmFtZXMgdGhhdCBhcmUgcmVzZXJ2ZWQgZm9yIEVDTUFTY3JpcHQgYnVpbHQtaW4gb2JqZWN0IHByb3BlcnRpZXMuXG4gKlxuICogQWxzbyBzZWUgc2FmZUlkZW50aWZpZXIoKSBmcm9tIEBidWZidWlsZC9wcm90b3BsdWdpbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNhZmVPYmplY3RQcm9wZXJ0eShuYW1lKSB7XG4gICAgcmV0dXJuIHJlc2VydmVkT2JqZWN0UHJvcGVydGllcy5oYXMobmFtZSkgPyBuYW1lICsgXCIkXCIgOiBuYW1lO1xufVxuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5pbXBvcnQgeyBwcm90b0NhbWVsQ2FzZSB9IGZyb20gXCIuLi9yZWZsZWN0L25hbWVzLmpzXCI7XG5pbXBvcnQgeyB1bnNhZmVJc1NldEV4cGxpY2l0IH0gZnJvbSBcIi4uL3JlZmxlY3QvdW5zYWZlLmpzXCI7XG4vKipcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXN0b3JlSnNvbk5hbWVzKG1lc3NhZ2UpIHtcbiAgICBmb3IgKGNvbnN0IGYgb2YgbWVzc2FnZS5maWVsZCkge1xuICAgICAgICBpZiAoIXVuc2FmZUlzU2V0RXhwbGljaXQoZiwgXCJqc29uTmFtZVwiKSkge1xuICAgICAgICAgICAgZi5qc29uTmFtZSA9IHByb3RvQ2FtZWxDYXNlKGYubmFtZSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgbWVzc2FnZS5uZXN0ZWRUeXBlLmZvckVhY2gocmVzdG9yZUpzb25OYW1lcyk7XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbmltcG9ydCB7IFNjYWxhclR5cGUgfSBmcm9tIFwiLi4vZGVzY3JpcHRvcnMuanNcIjtcbmltcG9ydCB7IHByb3RvSW50NjQgfSBmcm9tIFwiLi4vcHJvdG8taW50NjQuanNcIjtcbi8qKlxuICogUGFyc2UgYW4gZW51bSB2YWx1ZSBmcm9tIHRoZSBQcm90b2J1ZiB0ZXh0IGZvcm1hdC5cbiAqXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VUZXh0Rm9ybWF0RW51bVZhbHVlKGRlc2NFbnVtLCB2YWx1ZSkge1xuICAgIGNvbnN0IGVudW1WYWx1ZSA9IGRlc2NFbnVtLnZhbHVlcy5maW5kKCh2KSA9PiB2Lm5hbWUgPT09IHZhbHVlKTtcbiAgICBpZiAoIWVudW1WYWx1ZSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGNhbm5vdCBwYXJzZSAke2Rlc2NFbnVtfSBkZWZhdWx0IHZhbHVlOiAke3ZhbHVlfWApO1xuICAgIH1cbiAgICByZXR1cm4gZW51bVZhbHVlLm51bWJlcjtcbn1cbi8qKlxuICogUGFyc2UgYSBzY2FsYXIgdmFsdWUgZnJvbSB0aGUgUHJvdG9idWYgdGV4dCBmb3JtYXQuXG4gKlxuICogQHByaXZhdGVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlVGV4dEZvcm1hdFNjYWxhclZhbHVlKHR5cGUsIHZhbHVlKSB7XG4gICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TVFJJTkc6XG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5CWVRFUzoge1xuICAgICAgICAgICAgY29uc3QgdSA9IHVuZXNjYXBlQnl0ZXNEZWZhdWx0VmFsdWUodmFsdWUpO1xuICAgICAgICAgICAgaWYgKHUgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgcGFyc2UgJHtTY2FsYXJUeXBlW3R5cGVdfSBkZWZhdWx0IHZhbHVlOiAke3ZhbHVlfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHU7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLklOVDY0OlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0ZJWEVENjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TSU5UNjQ6XG4gICAgICAgICAgICByZXR1cm4gcHJvdG9JbnQ2NC5wYXJzZSh2YWx1ZSk7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5VSU5UNjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5GSVhFRDY0OlxuICAgICAgICAgICAgcmV0dXJuIHByb3RvSW50NjQudVBhcnNlKHZhbHVlKTtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkRPVUJMRTpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZMT0FUOlxuICAgICAgICAgICAgc3dpdGNoICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgXCJpbmZcIjpcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcbiAgICAgICAgICAgICAgICBjYXNlIFwiLWluZlwiOlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICAgICAgICAgICAgICAgIGNhc2UgXCJuYW5cIjpcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIE51bWJlci5OYU47XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHBhcnNlRmxvYXQodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuQk9PTDpcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZSA9PT0gXCJ0cnVlXCI7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5JTlQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlVJTlQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNJTlQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZJWEVEMzI6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TRklYRUQzMjpcbiAgICAgICAgICAgIHJldHVybiBwYXJzZUludCh2YWx1ZSwgMTApO1xuICAgIH1cbn1cbi8qKlxuICogUGFyc2VzIGEgdGV4dC1lbmNvZGVkIGRlZmF1bHQgdmFsdWUgKHByb3RvMikgb2YgYSBCWVRFUyBmaWVsZC5cbiAqL1xuZnVuY3Rpb24gdW5lc2NhcGVCeXRlc0RlZmF1bHRWYWx1ZShzdHIpIHtcbiAgICBjb25zdCBiID0gW107XG4gICAgY29uc3QgaW5wdXQgPSB7XG4gICAgICAgIHRhaWw6IHN0cixcbiAgICAgICAgYzogXCJcIixcbiAgICAgICAgbmV4dCgpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnRhaWwubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmMgPSB0aGlzLnRhaWxbMF07XG4gICAgICAgICAgICB0aGlzLnRhaWwgPSB0aGlzLnRhaWwuc3Vic3RyaW5nKDEpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0sXG4gICAgICAgIHRha2Uobikge1xuICAgICAgICAgICAgaWYgKHRoaXMudGFpbC5sZW5ndGggPj0gbikge1xuICAgICAgICAgICAgICAgIGNvbnN0IHIgPSB0aGlzLnRhaWwuc3Vic3RyaW5nKDAsIG4pO1xuICAgICAgICAgICAgICAgIHRoaXMudGFpbCA9IHRoaXMudGFpbC5zdWJzdHJpbmcobik7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0sXG4gICAgfTtcbiAgICB3aGlsZSAoaW5wdXQubmV4dCgpKSB7XG4gICAgICAgIHN3aXRjaCAoaW5wdXQuYykge1xuICAgICAgICAgICAgY2FzZSBcIlxcXFxcIjpcbiAgICAgICAgICAgICAgICBpZiAoaW5wdXQubmV4dCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHN3aXRjaCAoaW5wdXQuYykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcIlxcXFxcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiLnB1c2goaW5wdXQuYy5jaGFyQ29kZUF0KDApKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJiXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYi5wdXNoKDB4MDgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcImZcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiLnB1c2goMHgwYyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiblwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGIucHVzaCgweDBhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJyXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYi5wdXNoKDB4MGQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcInRcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiLnB1c2goMHgwOSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwidlwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGIucHVzaCgweDBiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCIwXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiMVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcIjJcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCIzXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiNFwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcIjVcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCI2XCI6XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiN1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcyA9IGlucHV0LmM7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdCA9IGlucHV0LnRha2UoMik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHQgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbiA9IHBhcnNlSW50KHMgKyB0LCA4KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoTnVtYmVyLmlzTmFOKG4pKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYi5wdXNoKG4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcInhcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBpbnB1dC5jO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHQgPSBpbnB1dC50YWtlKDIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0ID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG4gPSBwYXJzZUludChzICsgdCwgMTYpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChOdW1iZXIuaXNOYU4obikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiLnB1c2gobik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwidVwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcyA9IGlucHV0LmM7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdCA9IGlucHV0LnRha2UoNCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHQgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbiA9IHBhcnNlSW50KHMgKyB0LCAxNik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKE51bWJlci5pc05hTihuKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNodW5rID0gbmV3IFVpbnQ4QXJyYXkoNCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdmlldyA9IG5ldyBEYXRhVmlldyhjaHVuay5idWZmZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZpZXcuc2V0SW50MzIoMCwgbiwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYi5wdXNoKGNodW5rWzBdLCBjaHVua1sxXSwgY2h1bmtbMl0sIGNodW5rWzNdKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJVXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBzID0gaW5wdXQuYztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0ID0gaW5wdXQudGFrZSg4KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodCA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0YyA9IHByb3RvSW50NjQudUVuYyhzICsgdCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2h1bmsgPSBuZXcgVWludDhBcnJheSg4KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB2aWV3ID0gbmV3IERhdGFWaWV3KGNodW5rLmJ1ZmZlcik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmlldy5zZXRJbnQzMigwLCB0Yy5sbywgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmlldy5zZXRJbnQzMig0LCB0Yy5oaSwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYi5wdXNoKGNodW5rWzBdLCBjaHVua1sxXSwgY2h1bmtbMl0sIGNodW5rWzNdLCBjaHVua1s0XSwgY2h1bmtbNV0sIGNodW5rWzZdLCBjaHVua1s3XSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIGIucHVzaChpbnB1dC5jLmNoYXJDb2RlQXQoMCkpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBuZXcgVWludDhBcnJheShiKTtcbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuLyoqXG4gKiBJdGVyYXRlIG92ZXIgYWxsIHR5cGVzIC0gZW51bWVyYXRpb25zLCBleHRlbnNpb25zLCBzZXJ2aWNlcywgbWVzc2FnZXMgLVxuICogYW5kIGVudW1lcmF0aW9ucywgZXh0ZW5zaW9ucyBhbmQgbWVzc2FnZXMgbmVzdGVkIGluIG1lc3NhZ2VzLlxuICovXG5leHBvcnQgZnVuY3Rpb24qIG5lc3RlZFR5cGVzKGRlc2MpIHtcbiAgICBzd2l0Y2ggKGRlc2Mua2luZCkge1xuICAgICAgICBjYXNlIFwiZmlsZVwiOlxuICAgICAgICAgICAgZm9yIChjb25zdCBtZXNzYWdlIG9mIGRlc2MubWVzc2FnZXMpIHtcbiAgICAgICAgICAgICAgICB5aWVsZCBtZXNzYWdlO1xuICAgICAgICAgICAgICAgIHlpZWxkKiBuZXN0ZWRUeXBlcyhtZXNzYWdlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHlpZWxkKiBkZXNjLmVudW1zO1xuICAgICAgICAgICAgeWllbGQqIGRlc2Muc2VydmljZXM7XG4gICAgICAgICAgICB5aWVsZCogZGVzYy5leHRlbnNpb25zO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJtZXNzYWdlXCI6XG4gICAgICAgICAgICBmb3IgKGNvbnN0IG1lc3NhZ2Ugb2YgZGVzYy5uZXN0ZWRNZXNzYWdlcykge1xuICAgICAgICAgICAgICAgIHlpZWxkIG1lc3NhZ2U7XG4gICAgICAgICAgICAgICAgeWllbGQqIG5lc3RlZFR5cGVzKG1lc3NhZ2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgeWllbGQqIGRlc2MubmVzdGVkRW51bXM7XG4gICAgICAgICAgICB5aWVsZCogZGVzYy5uZXN0ZWRFeHRlbnNpb25zO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxufVxuLyoqXG4gKiBJdGVyYXRlIG92ZXIgdHlwZXMgcmVmZXJlbmNlZCBieSBmaWVsZHMgb2YgdGhlIGdpdmVuIG1lc3NhZ2UuXG4gKlxuICogRm9yIGV4YW1wbGU6XG4gKlxuICogYGBgcHJvdG9cbiAqIHN5bnRheD1cInByb3RvM1wiO1xuICpcbiAqIG1lc3NhZ2UgRXhhbXBsZSB7XG4gKiAgIE1zZyBzaW5ndWxhciA9IDE7XG4gKiAgIHJlcGVhdGVkIExldmVsIGxpc3QgPSAyO1xuICogfVxuICpcbiAqIG1lc3NhZ2UgTXNnIHt9XG4gKlxuICogZW51bSBMZXZlbCB7XG4gKiAgIExFVkVMX1VOU1BFQ0lGSUVEID0gMDtcbiAqIH1cbiAqIGBgYFxuICpcbiAqIFRoZSBtZXNzYWdlIEV4YW1wbGUgcmVmZXJlbmNlcyB0aGUgbWVzc2FnZSBNc2csIGFuZCB0aGUgZW51bSBMZXZlbC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHVzZWRUeXBlcyhkZXNjTWVzc2FnZSkge1xuICAgIHJldHVybiB1c2VkVHlwZXNJbnRlcm5hbChkZXNjTWVzc2FnZSwgbmV3IFNldCgpKTtcbn1cbmZ1bmN0aW9uKiB1c2VkVHlwZXNJbnRlcm5hbChkZXNjTWVzc2FnZSwgc2Vlbikge1xuICAgIHZhciBfYSwgX2I7XG4gICAgZm9yIChjb25zdCBmaWVsZCBvZiBkZXNjTWVzc2FnZS5maWVsZHMpIHtcbiAgICAgICAgY29uc3QgcmVmID0gKF9iID0gKF9hID0gZmllbGQuZW51bSkgIT09IG51bGwgJiYgX2EgIT09IHZvaWQgMCA/IF9hIDogZmllbGQubWVzc2FnZSkgIT09IG51bGwgJiYgX2IgIT09IHZvaWQgMCA/IF9iIDogdW5kZWZpbmVkO1xuICAgICAgICBpZiAoIXJlZiB8fCBzZWVuLmhhcyhyZWYudHlwZU5hbWUpKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBzZWVuLmFkZChyZWYudHlwZU5hbWUpO1xuICAgICAgICB5aWVsZCByZWY7XG4gICAgICAgIGlmIChyZWYua2luZCA9PSBcIm1lc3NhZ2VcIikge1xuICAgICAgICAgICAgeWllbGQqIHVzZWRUeXBlc0ludGVybmFsKHJlZiwgc2Vlbik7XG4gICAgICAgIH1cbiAgICB9XG59XG4vKipcbiAqIFJldHVybnMgdGhlIGFuY2VzdG9ycyBvZiBhIGdpdmVuIFByb3RvYnVmIGVsZW1lbnQsIHVwIHRvIHRoZSBmaWxlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyZW50VHlwZXMoZGVzYykge1xuICAgIGNvbnN0IHBhcmVudHMgPSBbXTtcbiAgICB3aGlsZSAoZGVzYy5raW5kICE9PSBcImZpbGVcIikge1xuICAgICAgICBjb25zdCBwID0gcGFyZW50KGRlc2MpO1xuICAgICAgICBkZXNjID0gcDtcbiAgICAgICAgcGFyZW50cy5wdXNoKHApO1xuICAgIH1cbiAgICByZXR1cm4gcGFyZW50cztcbn1cbmZ1bmN0aW9uIHBhcmVudChkZXNjKSB7XG4gICAgdmFyIF9hO1xuICAgIHN3aXRjaCAoZGVzYy5raW5kKSB7XG4gICAgICAgIGNhc2UgXCJlbnVtX3ZhbHVlXCI6XG4gICAgICAgIGNhc2UgXCJmaWVsZFwiOlxuICAgICAgICBjYXNlIFwib25lb2ZcIjpcbiAgICAgICAgY2FzZSBcInJwY1wiOlxuICAgICAgICAgICAgcmV0dXJuIGRlc2MucGFyZW50O1xuICAgICAgICBjYXNlIFwic2VydmljZVwiOlxuICAgICAgICAgICAgcmV0dXJuIGRlc2MuZmlsZTtcbiAgICAgICAgY2FzZSBcImV4dGVuc2lvblwiOlxuICAgICAgICBjYXNlIFwiZW51bVwiOlxuICAgICAgICBjYXNlIFwibWVzc2FnZVwiOlxuICAgICAgICAgICAgcmV0dXJuIChfYSA9IGRlc2MucGFyZW50KSAhPT0gbnVsbCAmJiBfYSAhPT0gdm9pZCAwID8gX2EgOiBkZXNjLmZpbGU7XG4gICAgfVxufVxuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5pbXBvcnQgeyBTY2FsYXJUeXBlLCB9IGZyb20gXCIuL2Rlc2NyaXB0b3JzLmpzXCI7XG5pbXBvcnQgeyBwYXJzZVRleHRGb3JtYXRFbnVtVmFsdWUsIHBhcnNlVGV4dEZvcm1hdFNjYWxhclZhbHVlLCB9IGZyb20gXCIuL3dpcmUvdGV4dC1mb3JtYXQuanNcIjtcbmltcG9ydCB7IG5lc3RlZFR5cGVzIH0gZnJvbSBcIi4vcmVmbGVjdC9uZXN0ZWQtdHlwZXMuanNcIjtcbmltcG9ydCB7IHVuc2FmZUlzU2V0RXhwbGljaXQgfSBmcm9tIFwiLi9yZWZsZWN0L3Vuc2FmZS5qc1wiO1xuaW1wb3J0IHsgcHJvdG9DYW1lbENhc2UsIHNhZmVPYmplY3RQcm9wZXJ0eSB9IGZyb20gXCIuL3JlZmxlY3QvbmFtZXMuanNcIjtcbi8qKlxuICogQ3JlYXRlIGEgcmVnaXN0cnkgZnJvbSB0aGUgZ2l2ZW4gaW5wdXRzLlxuICpcbiAqIEFuIGlucHV0IGNhbiBiZTpcbiAqIC0gQW55IG1lc3NhZ2UsIGVudW0sIHNlcnZpY2UsIG9yIGV4dGVuc2lvbiBkZXNjcmlwdG9yLCB3aGljaCBhZGRzIGp1c3QgdGhlXG4gKiAgIGRlc2NyaXB0b3IgZm9yIHRoaXMgdHlwZS5cbiAqIC0gQSBmaWxlIGRlc2NyaXB0b3IsIHdoaWNoIGFkZHMgYWxsIHR5cGVkIGRlZmluZWQgaW4gdGhpcyBmaWxlLlxuICogLSBBIHJlZ2lzdHJ5LCB3aGljaCBhZGRzIGFsbCB0eXBlcyBmcm9tIHRoZSByZWdpc3RyeS5cbiAqXG4gKiBGb3IgZHVwbGljYXRlIGRlc2NyaXB0b3JzIChzYW1lIHR5cGUgbmFtZSksIHRoZSBvbmUgZ2l2ZW4gbGFzdCB3aW5zLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlUmVnaXN0cnkoLi4uaW5wdXQpIHtcbiAgICByZXR1cm4gaW5pdEJhc2VSZWdpc3RyeShpbnB1dCk7XG59XG4vKipcbiAqIENyZWF0ZSBhIHJlZ2lzdHJ5IHRoYXQgYWxsb3dzIGFkZGluZyBhbmQgcmVtb3ZpbmcgZGVzY3JpcHRvcnMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNdXRhYmxlUmVnaXN0cnkoLi4uaW5wdXQpIHtcbiAgICBjb25zdCByZWcgPSBpbml0QmFzZVJlZ2lzdHJ5KGlucHV0KTtcbiAgICByZXR1cm4gT2JqZWN0LmFzc2lnbihPYmplY3QuYXNzaWduKHt9LCByZWcpLCB7IHJlbW92ZShkZXNjKSB7XG4gICAgICAgICAgICB2YXIgX2E7XG4gICAgICAgICAgICBpZiAoZGVzYy5raW5kID09IFwiZXh0ZW5zaW9uXCIpIHtcbiAgICAgICAgICAgICAgICAoX2EgPSByZWcuZXh0ZW5kZWVzLmdldChkZXNjLmV4dGVuZGVlLnR5cGVOYW1lKSkgPT09IG51bGwgfHwgX2EgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9hLmRlbGV0ZShkZXNjLm51bWJlcik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZWcudHlwZXMuZGVsZXRlKGRlc2MudHlwZU5hbWUpO1xuICAgICAgICB9IH0pO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUZpbGVSZWdpc3RyeSguLi5hcmdzKSB7XG4gICAgY29uc3QgcmVnaXN0cnkgPSBjcmVhdGVCYXNlUmVnaXN0cnkoKTtcbiAgICBpZiAoIWFyZ3MubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiByZWdpc3RyeTtcbiAgICB9XG4gICAgaWYgKFwiJHR5cGVOYW1lXCIgaW4gYXJnc1swXSAmJlxuICAgICAgICBhcmdzWzBdLiR0eXBlTmFtZSA9PSBcImdvb2dsZS5wcm90b2J1Zi5GaWxlRGVzY3JpcHRvclNldFwiKSB7XG4gICAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBhcmdzWzBdLmZpbGUpIHtcbiAgICAgICAgICAgIGFkZEZpbGUoZmlsZSwgcmVnaXN0cnkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZWdpc3RyeTtcbiAgICB9XG4gICAgaWYgKFwiJHR5cGVOYW1lXCIgaW4gYXJnc1swXSkge1xuICAgICAgICBjb25zdCBpbnB1dCA9IGFyZ3NbMF07XG4gICAgICAgIGNvbnN0IHJlc29sdmUgPSBhcmdzWzFdO1xuICAgICAgICBjb25zdCBzZWVuID0gbmV3IFNldCgpO1xuICAgICAgICBmdW5jdGlvbiByZWN1cnNlRGVwcyhmaWxlKSB7XG4gICAgICAgICAgICBjb25zdCBkZXBzID0gW107XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHByb3RvRmlsZU5hbWUgb2YgZmlsZS5kZXBlbmRlbmN5KSB7XG4gICAgICAgICAgICAgICAgaWYgKHJlZ2lzdHJ5LmdldEZpbGUocHJvdG9GaWxlTmFtZSkgIT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoc2Vlbi5oYXMocHJvdG9GaWxlTmFtZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IGRlcCA9IHJlc29sdmUocHJvdG9GaWxlTmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKCFkZXApIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmFibGUgdG8gcmVzb2x2ZSAke3Byb3RvRmlsZU5hbWV9LCBpbXBvcnRlZCBieSAke2ZpbGUubmFtZX1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKFwia2luZFwiIGluIGRlcCkge1xuICAgICAgICAgICAgICAgICAgICByZWdpc3RyeS5hZGRGaWxlKGRlcCwgZmFsc2UsIHRydWUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgc2Vlbi5hZGQoZGVwLm5hbWUpO1xuICAgICAgICAgICAgICAgICAgICBkZXBzLnB1c2goZGVwKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZGVwcy5jb25jYXQoLi4uZGVwcy5tYXAocmVjdXJzZURlcHMpKTtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgW2lucHV0LCAuLi5yZWN1cnNlRGVwcyhpbnB1dCldLnJldmVyc2UoKSkge1xuICAgICAgICAgICAgYWRkRmlsZShmaWxlLCByZWdpc3RyeSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIGZvciAoY29uc3QgZmlsZVJlZyBvZiBhcmdzKSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZVJlZy5maWxlcykge1xuICAgICAgICAgICAgICAgIHJlZ2lzdHJ5LmFkZEZpbGUoZmlsZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlZ2lzdHJ5O1xufVxuLyoqXG4gKiBAcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBjcmVhdGVCYXNlUmVnaXN0cnkoKSB7XG4gICAgY29uc3QgdHlwZXMgPSBuZXcgTWFwKCk7XG4gICAgY29uc3QgZXh0ZW5kZWVzID0gbmV3IE1hcCgpO1xuICAgIGNvbnN0IGZpbGVzID0gbmV3IE1hcCgpO1xuICAgIHJldHVybiB7XG4gICAgICAgIGtpbmQ6IFwicmVnaXN0cnlcIixcbiAgICAgICAgdHlwZXMsXG4gICAgICAgIGV4dGVuZGVlcyxcbiAgICAgICAgW1N5bWJvbC5pdGVyYXRvcl0oKSB7XG4gICAgICAgICAgICByZXR1cm4gdHlwZXMudmFsdWVzKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGdldCBmaWxlcygpIHtcbiAgICAgICAgICAgIHJldHVybiBmaWxlcy52YWx1ZXMoKTtcbiAgICAgICAgfSxcbiAgICAgICAgYWRkRmlsZShmaWxlLCBza2lwVHlwZXMsIHdpdGhEZXBzKSB7XG4gICAgICAgICAgICBmaWxlcy5zZXQoZmlsZS5wcm90by5uYW1lLCBmaWxlKTtcbiAgICAgICAgICAgIGlmICghc2tpcFR5cGVzKSB7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCB0eXBlIG9mIG5lc3RlZFR5cGVzKGZpbGUpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYWRkKHR5cGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh3aXRoRGVwcykge1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgZiBvZiBmaWxlLmRlcGVuZGVuY2llcykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmFkZEZpbGUoZiwgc2tpcFR5cGVzLCB3aXRoRGVwcyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBhZGQoZGVzYykge1xuICAgICAgICAgICAgaWYgKGRlc2Mua2luZCA9PSBcImV4dGVuc2lvblwiKSB7XG4gICAgICAgICAgICAgICAgbGV0IG51bWJlclRvRXh0ID0gZXh0ZW5kZWVzLmdldChkZXNjLmV4dGVuZGVlLnR5cGVOYW1lKTtcbiAgICAgICAgICAgICAgICBpZiAoIW51bWJlclRvRXh0KSB7XG4gICAgICAgICAgICAgICAgICAgIGV4dGVuZGVlcy5zZXQoZGVzYy5leHRlbmRlZS50eXBlTmFtZSwgXG4gICAgICAgICAgICAgICAgICAgIC8vIGJpb21lLWlnbm9yZSBsaW50L3N1c3BpY2lvdXMvbm9Bc3NpZ25JbkV4cHJlc3Npb25zOiBub1xuICAgICAgICAgICAgICAgICAgICAobnVtYmVyVG9FeHQgPSBuZXcgTWFwKCkpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbnVtYmVyVG9FeHQuc2V0KGRlc2MubnVtYmVyLCBkZXNjKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHR5cGVzLnNldChkZXNjLnR5cGVOYW1lLCBkZXNjKTtcbiAgICAgICAgfSxcbiAgICAgICAgZ2V0KHR5cGVOYW1lKSB7XG4gICAgICAgICAgICByZXR1cm4gdHlwZXMuZ2V0KHR5cGVOYW1lKTtcbiAgICAgICAgfSxcbiAgICAgICAgZ2V0RmlsZShmaWxlTmFtZSkge1xuICAgICAgICAgICAgcmV0dXJuIGZpbGVzLmdldChmaWxlTmFtZSk7XG4gICAgICAgIH0sXG4gICAgICAgIGdldE1lc3NhZ2UodHlwZU5hbWUpIHtcbiAgICAgICAgICAgIGNvbnN0IHQgPSB0eXBlcy5nZXQodHlwZU5hbWUpO1xuICAgICAgICAgICAgcmV0dXJuICh0ID09PSBudWxsIHx8IHQgPT09IHZvaWQgMCA/IHZvaWQgMCA6IHQua2luZCkgPT0gXCJtZXNzYWdlXCIgPyB0IDogdW5kZWZpbmVkO1xuICAgICAgICB9LFxuICAgICAgICBnZXRFbnVtKHR5cGVOYW1lKSB7XG4gICAgICAgICAgICBjb25zdCB0ID0gdHlwZXMuZ2V0KHR5cGVOYW1lKTtcbiAgICAgICAgICAgIHJldHVybiAodCA9PT0gbnVsbCB8fCB0ID09PSB2b2lkIDAgPyB2b2lkIDAgOiB0LmtpbmQpID09IFwiZW51bVwiID8gdCA6IHVuZGVmaW5lZDtcbiAgICAgICAgfSxcbiAgICAgICAgZ2V0RXh0ZW5zaW9uKHR5cGVOYW1lKSB7XG4gICAgICAgICAgICBjb25zdCB0ID0gdHlwZXMuZ2V0KHR5cGVOYW1lKTtcbiAgICAgICAgICAgIHJldHVybiAodCA9PT0gbnVsbCB8fCB0ID09PSB2b2lkIDAgPyB2b2lkIDAgOiB0LmtpbmQpID09IFwiZXh0ZW5zaW9uXCIgPyB0IDogdW5kZWZpbmVkO1xuICAgICAgICB9LFxuICAgICAgICBnZXRFeHRlbnNpb25Gb3IoZXh0ZW5kZWUsIG5vKSB7XG4gICAgICAgICAgICB2YXIgX2E7XG4gICAgICAgICAgICByZXR1cm4gKF9hID0gZXh0ZW5kZWVzLmdldChleHRlbmRlZS50eXBlTmFtZSkpID09PSBudWxsIHx8IF9hID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfYS5nZXQobm8pO1xuICAgICAgICB9LFxuICAgICAgICBnZXRTZXJ2aWNlKHR5cGVOYW1lKSB7XG4gICAgICAgICAgICBjb25zdCB0ID0gdHlwZXMuZ2V0KHR5cGVOYW1lKTtcbiAgICAgICAgICAgIHJldHVybiAodCA9PT0gbnVsbCB8fCB0ID09PSB2b2lkIDAgPyB2b2lkIDAgOiB0LmtpbmQpID09IFwic2VydmljZVwiID8gdCA6IHVuZGVmaW5lZDtcbiAgICAgICAgfSxcbiAgICB9O1xufVxuLyoqXG4gKiBAcHJpdmF0ZVxuICovXG5mdW5jdGlvbiBpbml0QmFzZVJlZ2lzdHJ5KGlucHV0cykge1xuICAgIGNvbnN0IHJlZ2lzdHJ5ID0gY3JlYXRlQmFzZVJlZ2lzdHJ5KCk7XG4gICAgZm9yIChjb25zdCBpbnB1dCBvZiBpbnB1dHMpIHtcbiAgICAgICAgc3dpdGNoIChpbnB1dC5raW5kKSB7XG4gICAgICAgICAgICBjYXNlIFwicmVnaXN0cnlcIjpcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IG4gb2YgaW5wdXQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVnaXN0cnkuYWRkKG4pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJmaWxlXCI6XG4gICAgICAgICAgICAgICAgcmVnaXN0cnkuYWRkRmlsZShpbnB1dCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHJlZ2lzdHJ5LmFkZChpbnB1dCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlZ2lzdHJ5O1xufVxuLy8gYm9vdHN0cmFwLWluamVjdCBnb29nbGUucHJvdG9idWYuRWRpdGlvbi5FRElUSU9OX1BST1RPMjogY29uc3QgJG5hbWU6IEVkaXRpb24uJGxvY2FsTmFtZSA9ICRudW1iZXI7XG5jb25zdCBFRElUSU9OX1BST1RPMiA9IDk5ODtcbi8vIGJvb3RzdHJhcC1pbmplY3QgZ29vZ2xlLnByb3RvYnVmLkVkaXRpb24uRURJVElPTl9QUk9UTzM6IGNvbnN0ICRuYW1lOiBFZGl0aW9uLiRsb2NhbE5hbWUgPSAkbnVtYmVyO1xuY29uc3QgRURJVElPTl9QUk9UTzMgPSA5OTk7XG4vLyBib290c3RyYXAtaW5qZWN0IGdvb2dsZS5wcm90b2J1Zi5GaWVsZERlc2NyaXB0b3JQcm90by5UeXBlLlRZUEVfU1RSSU5HOiBjb25zdCAkbmFtZTogRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZS4kbG9jYWxOYW1lID0gJG51bWJlcjtcbmNvbnN0IFRZUEVfU1RSSU5HID0gOTtcbi8vIGJvb3RzdHJhcC1pbmplY3QgZ29vZ2xlLnByb3RvYnVmLkZpZWxkRGVzY3JpcHRvclByb3RvLlR5cGUuVFlQRV9HUk9VUDogY29uc3QgJG5hbWU6IEZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGUuJGxvY2FsTmFtZSA9ICRudW1iZXI7XG5jb25zdCBUWVBFX0dST1VQID0gMTA7XG4vLyBib290c3RyYXAtaW5qZWN0IGdvb2dsZS5wcm90b2J1Zi5GaWVsZERlc2NyaXB0b3JQcm90by5UeXBlLlRZUEVfTUVTU0FHRTogY29uc3QgJG5hbWU6IEZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGUuJGxvY2FsTmFtZSA9ICRudW1iZXI7XG5jb25zdCBUWVBFX01FU1NBR0UgPSAxMTtcbi8vIGJvb3RzdHJhcC1pbmplY3QgZ29vZ2xlLnByb3RvYnVmLkZpZWxkRGVzY3JpcHRvclByb3RvLlR5cGUuVFlQRV9CWVRFUzogY29uc3QgJG5hbWU6IEZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGUuJGxvY2FsTmFtZSA9ICRudW1iZXI7XG5jb25zdCBUWVBFX0JZVEVTID0gMTI7XG4vLyBib290c3RyYXAtaW5qZWN0IGdvb2dsZS5wcm90b2J1Zi5GaWVsZERlc2NyaXB0b3JQcm90by5UeXBlLlRZUEVfRU5VTTogY29uc3QgJG5hbWU6IEZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGUuJGxvY2FsTmFtZSA9ICRudW1iZXI7XG5jb25zdCBUWVBFX0VOVU0gPSAxNDtcbi8vIGJvb3RzdHJhcC1pbmplY3QgZ29vZ2xlLnByb3RvYnVmLkZpZWxkRGVzY3JpcHRvclByb3RvLkxhYmVsLkxBQkVMX1JFUEVBVEVEOiBjb25zdCAkbmFtZTogRmllbGREZXNjcmlwdG9yUHJvdG9fTGFiZWwuJGxvY2FsTmFtZSA9ICRudW1iZXI7XG5jb25zdCBMQUJFTF9SRVBFQVRFRCA9IDM7XG4vLyBib290c3RyYXAtaW5qZWN0IGdvb2dsZS5wcm90b2J1Zi5GaWVsZERlc2NyaXB0b3JQcm90by5MYWJlbC5MQUJFTF9SRVFVSVJFRDogY29uc3QgJG5hbWU6IEZpZWxkRGVzY3JpcHRvclByb3RvX0xhYmVsLiRsb2NhbE5hbWUgPSAkbnVtYmVyO1xuY29uc3QgTEFCRUxfUkVRVUlSRUQgPSAyO1xuLy8gYm9vdHN0cmFwLWluamVjdCBnb29nbGUucHJvdG9idWYuRmllbGRPcHRpb25zLkpTVHlwZS5KU19TVFJJTkc6IGNvbnN0ICRuYW1lOiBGaWVsZE9wdGlvbnNfSlNUeXBlLiRsb2NhbE5hbWUgPSAkbnVtYmVyO1xuY29uc3QgSlNfU1RSSU5HID0gMTtcbi8vIGJvb3RzdHJhcC1pbmplY3QgZ29vZ2xlLnByb3RvYnVmLk1ldGhvZE9wdGlvbnMuSWRlbXBvdGVuY3lMZXZlbC5JREVNUE9URU5DWV9VTktOT1dOOiBjb25zdCAkbmFtZTogTWV0aG9kT3B0aW9uc19JZGVtcG90ZW5jeUxldmVsLiRsb2NhbE5hbWUgPSAkbnVtYmVyO1xuY29uc3QgSURFTVBPVEVOQ1lfVU5LTk9XTiA9IDA7XG4vLyBib290c3RyYXAtaW5qZWN0IGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LkZpZWxkUHJlc2VuY2UuRVhQTElDSVQ6IGNvbnN0ICRuYW1lOiBGZWF0dXJlU2V0X0ZpZWxkUHJlc2VuY2UuJGxvY2FsTmFtZSA9ICRudW1iZXI7XG5jb25zdCBFWFBMSUNJVCA9IDE7XG4vLyBib290c3RyYXAtaW5qZWN0IGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LkZpZWxkUHJlc2VuY2UuSU1QTElDSVQ6IGNvbnN0ICRuYW1lOiBGZWF0dXJlU2V0X0ZpZWxkUHJlc2VuY2UuJGxvY2FsTmFtZSA9ICRudW1iZXI7XG5jb25zdCBJTVBMSUNJVCA9IDI7XG4vLyBib290c3RyYXAtaW5qZWN0IGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LkZpZWxkUHJlc2VuY2UuTEVHQUNZX1JFUVVJUkVEOiBjb25zdCAkbmFtZTogRmVhdHVyZVNldF9GaWVsZFByZXNlbmNlLiRsb2NhbE5hbWUgPSAkbnVtYmVyO1xuY29uc3QgTEVHQUNZX1JFUVVJUkVEID0gMztcbi8vIGJvb3RzdHJhcC1pbmplY3QgZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXQuUmVwZWF0ZWRGaWVsZEVuY29kaW5nLlBBQ0tFRDogY29uc3QgJG5hbWU6IEZlYXR1cmVTZXRfUmVwZWF0ZWRGaWVsZEVuY29kaW5nLiRsb2NhbE5hbWUgPSAkbnVtYmVyO1xuY29uc3QgUEFDS0VEID0gMTtcbi8vIGJvb3RzdHJhcC1pbmplY3QgZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXQuTWVzc2FnZUVuY29kaW5nLkRFTElNSVRFRDogY29uc3QgJG5hbWU6IEZlYXR1cmVTZXRfTWVzc2FnZUVuY29kaW5nLiRsb2NhbE5hbWUgPSAkbnVtYmVyO1xuY29uc3QgREVMSU1JVEVEID0gMjtcbi8vIGJvb3RzdHJhcC1pbmplY3QgZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXQuRW51bVR5cGUuT1BFTjogY29uc3QgJG5hbWU6IEZlYXR1cmVTZXRfRW51bVR5cGUuJGxvY2FsTmFtZSA9ICRudW1iZXI7XG5jb25zdCBPUEVOID0gMTtcbi8vIGJpb21lLWlnbm9yZSBmb3JtYXQ6IHdhbnQgdGhpcyB0byByZWFkIHdlbGxcbi8vIGJvb3RzdHJhcC1pbmplY3QgZGVmYXVsdHM6IEVESVRJT05fUFJPVE8yIHRvIEVESVRJT05fMjAyNDogZXhwb3J0IGNvbnN0IG1pbmltdW1FZGl0aW9uOiBTdXBwb3J0ZWRFZGl0aW9uID0gJG1pbmltdW1FZGl0aW9uLCBtYXhpbXVtRWRpdGlvbjogU3VwcG9ydGVkRWRpdGlvbiA9ICRtYXhpbXVtRWRpdGlvbjtcbi8vIGdlbmVyYXRlZCBmcm9tIHByb3RvYyB2MzIuMFxuZXhwb3J0IGNvbnN0IG1pbmltdW1FZGl0aW9uID0gOTk4LCBtYXhpbXVtRWRpdGlvbiA9IDEwMDE7XG5jb25zdCBmZWF0dXJlRGVmYXVsdHMgPSB7XG4gICAgLy8gRURJVElPTl9QUk9UTzJcbiAgICA5OTg6IHtcbiAgICAgICAgZmllbGRQcmVzZW5jZTogMSwgLy8gRVhQTElDSVQsXG4gICAgICAgIGVudW1UeXBlOiAyLCAvLyBDTE9TRUQsXG4gICAgICAgIHJlcGVhdGVkRmllbGRFbmNvZGluZzogMiwgLy8gRVhQQU5ERUQsXG4gICAgICAgIHV0ZjhWYWxpZGF0aW9uOiAzLCAvLyBOT05FLFxuICAgICAgICBtZXNzYWdlRW5jb2Rpbmc6IDEsIC8vIExFTkdUSF9QUkVGSVhFRCxcbiAgICAgICAganNvbkZvcm1hdDogMiwgLy8gTEVHQUNZX0JFU1RfRUZGT1JULFxuICAgICAgICBlbmZvcmNlTmFtaW5nU3R5bGU6IDIsIC8vIFNUWUxFX0xFR0FDWSxcbiAgICAgICAgZGVmYXVsdFN5bWJvbFZpc2liaWxpdHk6IDEsIC8vIEVYUE9SVF9BTEwsXG4gICAgfSxcbiAgICAvLyBFRElUSU9OX1BST1RPM1xuICAgIDk5OToge1xuICAgICAgICBmaWVsZFByZXNlbmNlOiAyLCAvLyBJTVBMSUNJVCxcbiAgICAgICAgZW51bVR5cGU6IDEsIC8vIE9QRU4sXG4gICAgICAgIHJlcGVhdGVkRmllbGRFbmNvZGluZzogMSwgLy8gUEFDS0VELFxuICAgICAgICB1dGY4VmFsaWRhdGlvbjogMiwgLy8gVkVSSUZZLFxuICAgICAgICBtZXNzYWdlRW5jb2Rpbmc6IDEsIC8vIExFTkdUSF9QUkVGSVhFRCxcbiAgICAgICAganNvbkZvcm1hdDogMSwgLy8gQUxMT1csXG4gICAgICAgIGVuZm9yY2VOYW1pbmdTdHlsZTogMiwgLy8gU1RZTEVfTEVHQUNZLFxuICAgICAgICBkZWZhdWx0U3ltYm9sVmlzaWJpbGl0eTogMSwgLy8gRVhQT1JUX0FMTCxcbiAgICB9LFxuICAgIC8vIEVESVRJT05fMjAyM1xuICAgIDEwMDA6IHtcbiAgICAgICAgZmllbGRQcmVzZW5jZTogMSwgLy8gRVhQTElDSVQsXG4gICAgICAgIGVudW1UeXBlOiAxLCAvLyBPUEVOLFxuICAgICAgICByZXBlYXRlZEZpZWxkRW5jb2Rpbmc6IDEsIC8vIFBBQ0tFRCxcbiAgICAgICAgdXRmOFZhbGlkYXRpb246IDIsIC8vIFZFUklGWSxcbiAgICAgICAgbWVzc2FnZUVuY29kaW5nOiAxLCAvLyBMRU5HVEhfUFJFRklYRUQsXG4gICAgICAgIGpzb25Gb3JtYXQ6IDEsIC8vIEFMTE9XLFxuICAgICAgICBlbmZvcmNlTmFtaW5nU3R5bGU6IDIsIC8vIFNUWUxFX0xFR0FDWSxcbiAgICAgICAgZGVmYXVsdFN5bWJvbFZpc2liaWxpdHk6IDEsIC8vIEVYUE9SVF9BTEwsXG4gICAgfSxcbiAgICAvLyBFRElUSU9OXzIwMjRcbiAgICAxMDAxOiB7XG4gICAgICAgIGZpZWxkUHJlc2VuY2U6IDEsIC8vIEVYUExJQ0lULFxuICAgICAgICBlbnVtVHlwZTogMSwgLy8gT1BFTixcbiAgICAgICAgcmVwZWF0ZWRGaWVsZEVuY29kaW5nOiAxLCAvLyBQQUNLRUQsXG4gICAgICAgIHV0ZjhWYWxpZGF0aW9uOiAyLCAvLyBWRVJJRlksXG4gICAgICAgIG1lc3NhZ2VFbmNvZGluZzogMSwgLy8gTEVOR1RIX1BSRUZJWEVELFxuICAgICAgICBqc29uRm9ybWF0OiAxLCAvLyBBTExPVyxcbiAgICAgICAgZW5mb3JjZU5hbWluZ1N0eWxlOiAxLCAvLyBTVFlMRTIwMjQsXG4gICAgICAgIGRlZmF1bHRTeW1ib2xWaXNpYmlsaXR5OiAyLCAvLyBFWFBPUlRfVE9QX0xFVkVMLFxuICAgIH0sXG59O1xuLyoqXG4gKiBDcmVhdGUgYSBkZXNjcmlwdG9yIGZvciBhIGZpbGUsIGFkZCBpdCB0byB0aGUgcmVnaXN0cnkuXG4gKi9cbmZ1bmN0aW9uIGFkZEZpbGUocHJvdG8sIHJlZykge1xuICAgIHZhciBfYSwgX2I7XG4gICAgY29uc3QgZmlsZSA9IHtcbiAgICAgICAga2luZDogXCJmaWxlXCIsXG4gICAgICAgIHByb3RvLFxuICAgICAgICBkZXByZWNhdGVkOiAoX2IgPSAoX2EgPSBwcm90by5vcHRpb25zKSA9PT0gbnVsbCB8fCBfYSA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2EuZGVwcmVjYXRlZCkgIT09IG51bGwgJiYgX2IgIT09IHZvaWQgMCA/IF9iIDogZmFsc2UsXG4gICAgICAgIGVkaXRpb246IGdldEZpbGVFZGl0aW9uKHByb3RvKSxcbiAgICAgICAgbmFtZTogcHJvdG8ubmFtZS5yZXBsYWNlKC9cXC5wcm90byQvLCBcIlwiKSxcbiAgICAgICAgZGVwZW5kZW5jaWVzOiBmaW5kRmlsZURlcGVuZGVuY2llcyhwcm90bywgcmVnKSxcbiAgICAgICAgZW51bXM6IFtdLFxuICAgICAgICBtZXNzYWdlczogW10sXG4gICAgICAgIGV4dGVuc2lvbnM6IFtdLFxuICAgICAgICBzZXJ2aWNlczogW10sXG4gICAgICAgIHRvU3RyaW5nKCkge1xuICAgICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9yZXN0cmljdC10ZW1wbGF0ZS1leHByZXNzaW9ucyAtLSB3ZSBhc3NlcnRlZCBhYm92ZVxuICAgICAgICAgICAgcmV0dXJuIGBmaWxlICR7cHJvdG8ubmFtZX1gO1xuICAgICAgICB9LFxuICAgIH07XG4gICAgY29uc3QgbWFwRW50cmllc1N0b3JlID0gbmV3IE1hcCgpO1xuICAgIGNvbnN0IG1hcEVudHJpZXMgPSB7XG4gICAgICAgIGdldCh0eXBlTmFtZSkge1xuICAgICAgICAgICAgcmV0dXJuIG1hcEVudHJpZXNTdG9yZS5nZXQodHlwZU5hbWUpO1xuICAgICAgICB9LFxuICAgICAgICBhZGQoZGVzYykge1xuICAgICAgICAgICAgdmFyIF9hO1xuICAgICAgICAgICAgYXNzZXJ0KCgoX2EgPSBkZXNjLnByb3RvLm9wdGlvbnMpID09PSBudWxsIHx8IF9hID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfYS5tYXBFbnRyeSkgPT09IHRydWUpO1xuICAgICAgICAgICAgbWFwRW50cmllc1N0b3JlLnNldChkZXNjLnR5cGVOYW1lLCBkZXNjKTtcbiAgICAgICAgfSxcbiAgICB9O1xuICAgIGZvciAoY29uc3QgZW51bVByb3RvIG9mIHByb3RvLmVudW1UeXBlKSB7XG4gICAgICAgIGFkZEVudW0oZW51bVByb3RvLCBmaWxlLCB1bmRlZmluZWQsIHJlZyk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgbWVzc2FnZVByb3RvIG9mIHByb3RvLm1lc3NhZ2VUeXBlKSB7XG4gICAgICAgIGFkZE1lc3NhZ2UobWVzc2FnZVByb3RvLCBmaWxlLCB1bmRlZmluZWQsIHJlZywgbWFwRW50cmllcyk7XG4gICAgfVxuICAgIGZvciAoY29uc3Qgc2VydmljZVByb3RvIG9mIHByb3RvLnNlcnZpY2UpIHtcbiAgICAgICAgYWRkU2VydmljZShzZXJ2aWNlUHJvdG8sIGZpbGUsIHJlZyk7XG4gICAgfVxuICAgIGFkZEV4dGVuc2lvbnMoZmlsZSwgcmVnKTtcbiAgICBmb3IgKGNvbnN0IG1hcEVudHJ5IG9mIG1hcEVudHJpZXNTdG9yZS52YWx1ZXMoKSkge1xuICAgICAgICAvLyB0byBjcmVhdGUgYSBtYXAgZmllbGQsIHdlIG5lZWQgYWNjZXNzIHRvIHRoZSBtYXAgZW50cnkncyBmaWVsZHNcbiAgICAgICAgYWRkRmllbGRzKG1hcEVudHJ5LCByZWcsIG1hcEVudHJpZXMpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IG1lc3NhZ2Ugb2YgZmlsZS5tZXNzYWdlcykge1xuICAgICAgICBhZGRGaWVsZHMobWVzc2FnZSwgcmVnLCBtYXBFbnRyaWVzKTtcbiAgICAgICAgYWRkRXh0ZW5zaW9ucyhtZXNzYWdlLCByZWcpO1xuICAgIH1cbiAgICByZWcuYWRkRmlsZShmaWxlLCB0cnVlKTtcbn1cbi8qKlxuICogQ3JlYXRlIGRlc2NyaXB0b3JzIGZvciBleHRlbnNpb25zLCBhbmQgYWRkIHRoZW0gdG8gdGhlIG1lc3NhZ2UgLyBmaWxlLFxuICogYW5kIHRvIG91ciBjYXJ0LlxuICogUmVjdXJzZXMgaW50byBuZXN0ZWQgdHlwZXMuXG4gKi9cbmZ1bmN0aW9uIGFkZEV4dGVuc2lvbnMoZGVzYywgcmVnKSB7XG4gICAgc3dpdGNoIChkZXNjLmtpbmQpIHtcbiAgICAgICAgY2FzZSBcImZpbGVcIjpcbiAgICAgICAgICAgIGZvciAoY29uc3QgcHJvdG8gb2YgZGVzYy5wcm90by5leHRlbnNpb24pIHtcbiAgICAgICAgICAgICAgICBjb25zdCBleHQgPSBuZXdGaWVsZChwcm90bywgZGVzYywgcmVnKTtcbiAgICAgICAgICAgICAgICBkZXNjLmV4dGVuc2lvbnMucHVzaChleHQpO1xuICAgICAgICAgICAgICAgIHJlZy5hZGQoZXh0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwibWVzc2FnZVwiOlxuICAgICAgICAgICAgZm9yIChjb25zdCBwcm90byBvZiBkZXNjLnByb3RvLmV4dGVuc2lvbikge1xuICAgICAgICAgICAgICAgIGNvbnN0IGV4dCA9IG5ld0ZpZWxkKHByb3RvLCBkZXNjLCByZWcpO1xuICAgICAgICAgICAgICAgIGRlc2MubmVzdGVkRXh0ZW5zaW9ucy5wdXNoKGV4dCk7XG4gICAgICAgICAgICAgICAgcmVnLmFkZChleHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChjb25zdCBtZXNzYWdlIG9mIGRlc2MubmVzdGVkTWVzc2FnZXMpIHtcbiAgICAgICAgICAgICAgICBhZGRFeHRlbnNpb25zKG1lc3NhZ2UsIHJlZyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICB9XG59XG4vKipcbiAqIENyZWF0ZSBkZXNjcmlwdG9ycyBmb3IgZmllbGRzIGFuZCBvbmVvZiBncm91cHMsIGFuZCBhZGQgdGhlbSB0byB0aGUgbWVzc2FnZS5cbiAqIFJlY3Vyc2VzIGludG8gbmVzdGVkIHR5cGVzLlxuICovXG5mdW5jdGlvbiBhZGRGaWVsZHMobWVzc2FnZSwgcmVnLCBtYXBFbnRyaWVzKSB7XG4gICAgY29uc3QgYWxsT25lb2ZzID0gbWVzc2FnZS5wcm90by5vbmVvZkRlY2wubWFwKChwcm90bykgPT4gbmV3T25lb2YocHJvdG8sIG1lc3NhZ2UpKTtcbiAgICBjb25zdCBvbmVvZnNTZWVuID0gbmV3IFNldCgpO1xuICAgIGZvciAoY29uc3QgcHJvdG8gb2YgbWVzc2FnZS5wcm90by5maWVsZCkge1xuICAgICAgICBjb25zdCBvbmVvZiA9IGZpbmRPbmVvZihwcm90bywgYWxsT25lb2ZzKTtcbiAgICAgICAgY29uc3QgZmllbGQgPSBuZXdGaWVsZChwcm90bywgbWVzc2FnZSwgcmVnLCBvbmVvZiwgbWFwRW50cmllcyk7XG4gICAgICAgIG1lc3NhZ2UuZmllbGRzLnB1c2goZmllbGQpO1xuICAgICAgICBtZXNzYWdlLmZpZWxkW2ZpZWxkLmxvY2FsTmFtZV0gPSBmaWVsZDtcbiAgICAgICAgaWYgKG9uZW9mID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIG1lc3NhZ2UubWVtYmVycy5wdXNoKGZpZWxkKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIG9uZW9mLmZpZWxkcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgICAgIGlmICghb25lb2ZzU2Vlbi5oYXMob25lb2YpKSB7XG4gICAgICAgICAgICAgICAgb25lb2ZzU2Vlbi5hZGQob25lb2YpO1xuICAgICAgICAgICAgICAgIG1lc3NhZ2UubWVtYmVycy5wdXNoKG9uZW9mKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IG9uZW9mIG9mIGFsbE9uZW9mcy5maWx0ZXIoKG8pID0+IG9uZW9mc1NlZW4uaGFzKG8pKSkge1xuICAgICAgICBtZXNzYWdlLm9uZW9mcy5wdXNoKG9uZW9mKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBjaGlsZCBvZiBtZXNzYWdlLm5lc3RlZE1lc3NhZ2VzKSB7XG4gICAgICAgIGFkZEZpZWxkcyhjaGlsZCwgcmVnLCBtYXBFbnRyaWVzKTtcbiAgICB9XG59XG4vKipcbiAqIENyZWF0ZSBhIGRlc2NyaXB0b3IgZm9yIGFuIGVudW1lcmF0aW9uLCBhbmQgYWRkIGl0IG91ciBjYXJ0IGFuZCB0byB0aGVcbiAqIHBhcmVudCB0eXBlLCBpZiBhbnkuXG4gKi9cbmZ1bmN0aW9uIGFkZEVudW0ocHJvdG8sIGZpbGUsIHBhcmVudCwgcmVnKSB7XG4gICAgdmFyIF9hLCBfYiwgX2MsIF9kLCBfZTtcbiAgICBjb25zdCBzaGFyZWRQcmVmaXggPSBmaW5kRW51bVNoYXJlZFByZWZpeChwcm90by5uYW1lLCBwcm90by52YWx1ZSk7XG4gICAgY29uc3QgZGVzYyA9IHtcbiAgICAgICAga2luZDogXCJlbnVtXCIsXG4gICAgICAgIHByb3RvLFxuICAgICAgICBkZXByZWNhdGVkOiAoX2IgPSAoX2EgPSBwcm90by5vcHRpb25zKSA9PT0gbnVsbCB8fCBfYSA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2EuZGVwcmVjYXRlZCkgIT09IG51bGwgJiYgX2IgIT09IHZvaWQgMCA/IF9iIDogZmFsc2UsXG4gICAgICAgIGZpbGUsXG4gICAgICAgIHBhcmVudCxcbiAgICAgICAgb3BlbjogdHJ1ZSxcbiAgICAgICAgbmFtZTogcHJvdG8ubmFtZSxcbiAgICAgICAgdHlwZU5hbWU6IG1ha2VUeXBlTmFtZShwcm90bywgcGFyZW50LCBmaWxlKSxcbiAgICAgICAgdmFsdWU6IHt9LFxuICAgICAgICB2YWx1ZXM6IFtdLFxuICAgICAgICBzaGFyZWRQcmVmaXgsXG4gICAgICAgIHRvU3RyaW5nKCkge1xuICAgICAgICAgICAgcmV0dXJuIGBlbnVtICR7dGhpcy50eXBlTmFtZX1gO1xuICAgICAgICB9LFxuICAgIH07XG4gICAgZGVzYy5vcGVuID0gaXNFbnVtT3BlbihkZXNjKTtcbiAgICByZWcuYWRkKGRlc2MpO1xuICAgIGZvciAoY29uc3QgcCBvZiBwcm90by52YWx1ZSkge1xuICAgICAgICBjb25zdCBuYW1lID0gcC5uYW1lO1xuICAgICAgICBkZXNjLnZhbHVlcy5wdXNoKFxuICAgICAgICAvLyBiaW9tZS1pZ25vcmUgbGludC9zdXNwaWNpb3VzL25vQXNzaWduSW5FeHByZXNzaW9uczogbm9cbiAgICAgICAgKGRlc2MudmFsdWVbcC5udW1iZXJdID0ge1xuICAgICAgICAgICAga2luZDogXCJlbnVtX3ZhbHVlXCIsXG4gICAgICAgICAgICBwcm90bzogcCxcbiAgICAgICAgICAgIGRlcHJlY2F0ZWQ6IChfZCA9IChfYyA9IHAub3B0aW9ucykgPT09IG51bGwgfHwgX2MgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9jLmRlcHJlY2F0ZWQpICE9PSBudWxsICYmIF9kICE9PSB2b2lkIDAgPyBfZCA6IGZhbHNlLFxuICAgICAgICAgICAgcGFyZW50OiBkZXNjLFxuICAgICAgICAgICAgbmFtZSxcbiAgICAgICAgICAgIGxvY2FsTmFtZTogc2FmZU9iamVjdFByb3BlcnR5KHNoYXJlZFByZWZpeCA9PSB1bmRlZmluZWRcbiAgICAgICAgICAgICAgICA/IG5hbWVcbiAgICAgICAgICAgICAgICA6IG5hbWUuc3Vic3RyaW5nKHNoYXJlZFByZWZpeC5sZW5ndGgpKSxcbiAgICAgICAgICAgIG51bWJlcjogcC5udW1iZXIsXG4gICAgICAgICAgICB0b1N0cmluZygpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYGVudW0gdmFsdWUgJHtkZXNjLnR5cGVOYW1lfS4ke25hbWV9YDtcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0pKTtcbiAgICB9XG4gICAgKChfZSA9IHBhcmVudCA9PT0gbnVsbCB8fCBwYXJlbnQgPT09IHZvaWQgMCA/IHZvaWQgMCA6IHBhcmVudC5uZXN0ZWRFbnVtcykgIT09IG51bGwgJiYgX2UgIT09IHZvaWQgMCA/IF9lIDogZmlsZS5lbnVtcykucHVzaChkZXNjKTtcbn1cbi8qKlxuICogQ3JlYXRlIGEgZGVzY3JpcHRvciBmb3IgYSBtZXNzYWdlLCBpbmNsdWRpbmcgbmVzdGVkIHR5cGVzLCBhbmQgYWRkIGl0IHRvIG91clxuICogY2FydC4gTm90ZSB0aGF0IHRoaXMgZG9lcyBub3QgY3JlYXRlIGRlc2NyaXB0b3JzIGZpZWxkcy5cbiAqL1xuZnVuY3Rpb24gYWRkTWVzc2FnZShwcm90bywgZmlsZSwgcGFyZW50LCByZWcsIG1hcEVudHJpZXMpIHtcbiAgICB2YXIgX2EsIF9iLCBfYywgX2Q7XG4gICAgY29uc3QgZGVzYyA9IHtcbiAgICAgICAga2luZDogXCJtZXNzYWdlXCIsXG4gICAgICAgIHByb3RvLFxuICAgICAgICBkZXByZWNhdGVkOiAoX2IgPSAoX2EgPSBwcm90by5vcHRpb25zKSA9PT0gbnVsbCB8fCBfYSA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2EuZGVwcmVjYXRlZCkgIT09IG51bGwgJiYgX2IgIT09IHZvaWQgMCA/IF9iIDogZmFsc2UsXG4gICAgICAgIGZpbGUsXG4gICAgICAgIHBhcmVudCxcbiAgICAgICAgbmFtZTogcHJvdG8ubmFtZSxcbiAgICAgICAgdHlwZU5hbWU6IG1ha2VUeXBlTmFtZShwcm90bywgcGFyZW50LCBmaWxlKSxcbiAgICAgICAgZmllbGRzOiBbXSxcbiAgICAgICAgZmllbGQ6IHt9LFxuICAgICAgICBvbmVvZnM6IFtdLFxuICAgICAgICBtZW1iZXJzOiBbXSxcbiAgICAgICAgbmVzdGVkRW51bXM6IFtdLFxuICAgICAgICBuZXN0ZWRNZXNzYWdlczogW10sXG4gICAgICAgIG5lc3RlZEV4dGVuc2lvbnM6IFtdLFxuICAgICAgICB0b1N0cmluZygpIHtcbiAgICAgICAgICAgIHJldHVybiBgbWVzc2FnZSAke3RoaXMudHlwZU5hbWV9YDtcbiAgICAgICAgfSxcbiAgICB9O1xuICAgIGlmICgoKF9jID0gcHJvdG8ub3B0aW9ucykgPT09IG51bGwgfHwgX2MgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9jLm1hcEVudHJ5KSA9PT0gdHJ1ZSkge1xuICAgICAgICBtYXBFbnRyaWVzLmFkZChkZXNjKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgICgoX2QgPSBwYXJlbnQgPT09IG51bGwgfHwgcGFyZW50ID09PSB2b2lkIDAgPyB2b2lkIDAgOiBwYXJlbnQubmVzdGVkTWVzc2FnZXMpICE9PSBudWxsICYmIF9kICE9PSB2b2lkIDAgPyBfZCA6IGZpbGUubWVzc2FnZXMpLnB1c2goZGVzYyk7XG4gICAgICAgIHJlZy5hZGQoZGVzYyk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgZW51bVByb3RvIG9mIHByb3RvLmVudW1UeXBlKSB7XG4gICAgICAgIGFkZEVudW0oZW51bVByb3RvLCBmaWxlLCBkZXNjLCByZWcpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IG1lc3NhZ2VQcm90byBvZiBwcm90by5uZXN0ZWRUeXBlKSB7XG4gICAgICAgIGFkZE1lc3NhZ2UobWVzc2FnZVByb3RvLCBmaWxlLCBkZXNjLCByZWcsIG1hcEVudHJpZXMpO1xuICAgIH1cbn1cbi8qKlxuICogQ3JlYXRlIGEgZGVzY3JpcHRvciBmb3IgYSBzZXJ2aWNlLCBpbmNsdWRpbmcgbWV0aG9kcywgYW5kIGFkZCBpdCB0byBvdXJcbiAqIGNhcnQuXG4gKi9cbmZ1bmN0aW9uIGFkZFNlcnZpY2UocHJvdG8sIGZpbGUsIHJlZykge1xuICAgIHZhciBfYSwgX2I7XG4gICAgY29uc3QgZGVzYyA9IHtcbiAgICAgICAga2luZDogXCJzZXJ2aWNlXCIsXG4gICAgICAgIHByb3RvLFxuICAgICAgICBkZXByZWNhdGVkOiAoX2IgPSAoX2EgPSBwcm90by5vcHRpb25zKSA9PT0gbnVsbCB8fCBfYSA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2EuZGVwcmVjYXRlZCkgIT09IG51bGwgJiYgX2IgIT09IHZvaWQgMCA/IF9iIDogZmFsc2UsXG4gICAgICAgIGZpbGUsXG4gICAgICAgIG5hbWU6IHByb3RvLm5hbWUsXG4gICAgICAgIHR5cGVOYW1lOiBtYWtlVHlwZU5hbWUocHJvdG8sIHVuZGVmaW5lZCwgZmlsZSksXG4gICAgICAgIG1ldGhvZHM6IFtdLFxuICAgICAgICBtZXRob2Q6IHt9LFxuICAgICAgICB0b1N0cmluZygpIHtcbiAgICAgICAgICAgIHJldHVybiBgc2VydmljZSAke3RoaXMudHlwZU5hbWV9YDtcbiAgICAgICAgfSxcbiAgICB9O1xuICAgIGZpbGUuc2VydmljZXMucHVzaChkZXNjKTtcbiAgICByZWcuYWRkKGRlc2MpO1xuICAgIGZvciAoY29uc3QgbWV0aG9kUHJvdG8gb2YgcHJvdG8ubWV0aG9kKSB7XG4gICAgICAgIGNvbnN0IG1ldGhvZCA9IG5ld01ldGhvZChtZXRob2RQcm90bywgZGVzYywgcmVnKTtcbiAgICAgICAgZGVzYy5tZXRob2RzLnB1c2gobWV0aG9kKTtcbiAgICAgICAgZGVzYy5tZXRob2RbbWV0aG9kLmxvY2FsTmFtZV0gPSBtZXRob2Q7XG4gICAgfVxufVxuLyoqXG4gKiBDcmVhdGUgYSBkZXNjcmlwdG9yIGZvciBhIG1ldGhvZC5cbiAqL1xuZnVuY3Rpb24gbmV3TWV0aG9kKHByb3RvLCBwYXJlbnQsIHJlZykge1xuICAgIHZhciBfYSwgX2IsIF9jLCBfZDtcbiAgICBsZXQgbWV0aG9kS2luZDtcbiAgICBpZiAocHJvdG8uY2xpZW50U3RyZWFtaW5nICYmIHByb3RvLnNlcnZlclN0cmVhbWluZykge1xuICAgICAgICBtZXRob2RLaW5kID0gXCJiaWRpX3N0cmVhbWluZ1wiO1xuICAgIH1cbiAgICBlbHNlIGlmIChwcm90by5jbGllbnRTdHJlYW1pbmcpIHtcbiAgICAgICAgbWV0aG9kS2luZCA9IFwiY2xpZW50X3N0cmVhbWluZ1wiO1xuICAgIH1cbiAgICBlbHNlIGlmIChwcm90by5zZXJ2ZXJTdHJlYW1pbmcpIHtcbiAgICAgICAgbWV0aG9kS2luZCA9IFwic2VydmVyX3N0cmVhbWluZ1wiO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgbWV0aG9kS2luZCA9IFwidW5hcnlcIjtcbiAgICB9XG4gICAgY29uc3QgaW5wdXQgPSByZWcuZ2V0TWVzc2FnZSh0cmltTGVhZGluZ0RvdChwcm90by5pbnB1dFR5cGUpKTtcbiAgICBjb25zdCBvdXRwdXQgPSByZWcuZ2V0TWVzc2FnZSh0cmltTGVhZGluZ0RvdChwcm90by5vdXRwdXRUeXBlKSk7XG4gICAgYXNzZXJ0KGlucHV0LCBgaW52YWxpZCBNZXRob2REZXNjcmlwdG9yUHJvdG86IGlucHV0X3R5cGUgJHtwcm90by5pbnB1dFR5cGV9IG5vdCBmb3VuZGApO1xuICAgIGFzc2VydChvdXRwdXQsIGBpbnZhbGlkIE1ldGhvZERlc2NyaXB0b3JQcm90bzogb3V0cHV0X3R5cGUgJHtwcm90by5pbnB1dFR5cGV9IG5vdCBmb3VuZGApO1xuICAgIGNvbnN0IG5hbWUgPSBwcm90by5uYW1lO1xuICAgIHJldHVybiB7XG4gICAgICAgIGtpbmQ6IFwicnBjXCIsXG4gICAgICAgIHByb3RvLFxuICAgICAgICBkZXByZWNhdGVkOiAoX2IgPSAoX2EgPSBwcm90by5vcHRpb25zKSA9PT0gbnVsbCB8fCBfYSA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2EuZGVwcmVjYXRlZCkgIT09IG51bGwgJiYgX2IgIT09IHZvaWQgMCA/IF9iIDogZmFsc2UsXG4gICAgICAgIHBhcmVudCxcbiAgICAgICAgbmFtZSxcbiAgICAgICAgbG9jYWxOYW1lOiBzYWZlT2JqZWN0UHJvcGVydHkobmFtZS5sZW5ndGhcbiAgICAgICAgICAgID8gc2FmZU9iamVjdFByb3BlcnR5KG5hbWVbMF0udG9Mb3dlckNhc2UoKSArIG5hbWUuc3Vic3RyaW5nKDEpKVxuICAgICAgICAgICAgOiBuYW1lKSxcbiAgICAgICAgbWV0aG9kS2luZCxcbiAgICAgICAgaW5wdXQsXG4gICAgICAgIG91dHB1dCxcbiAgICAgICAgaWRlbXBvdGVuY3k6IChfZCA9IChfYyA9IHByb3RvLm9wdGlvbnMpID09PSBudWxsIHx8IF9jID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfYy5pZGVtcG90ZW5jeUxldmVsKSAhPT0gbnVsbCAmJiBfZCAhPT0gdm9pZCAwID8gX2QgOiBJREVNUE9URU5DWV9VTktOT1dOLFxuICAgICAgICB0b1N0cmluZygpIHtcbiAgICAgICAgICAgIHJldHVybiBgcnBjICR7cGFyZW50LnR5cGVOYW1lfS4ke25hbWV9YDtcbiAgICAgICAgfSxcbiAgICB9O1xufVxuLyoqXG4gKiBDcmVhdGUgYSBkZXNjcmlwdG9yIGZvciBhIG9uZW9mIGdyb3VwLlxuICovXG5mdW5jdGlvbiBuZXdPbmVvZihwcm90bywgcGFyZW50KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAga2luZDogXCJvbmVvZlwiLFxuICAgICAgICBwcm90byxcbiAgICAgICAgZGVwcmVjYXRlZDogZmFsc2UsXG4gICAgICAgIHBhcmVudCxcbiAgICAgICAgZmllbGRzOiBbXSxcbiAgICAgICAgbmFtZTogcHJvdG8ubmFtZSxcbiAgICAgICAgbG9jYWxOYW1lOiBzYWZlT2JqZWN0UHJvcGVydHkocHJvdG9DYW1lbENhc2UocHJvdG8ubmFtZSkpLFxuICAgICAgICB0b1N0cmluZygpIHtcbiAgICAgICAgICAgIHJldHVybiBgb25lb2YgJHtwYXJlbnQudHlwZU5hbWV9LiR7dGhpcy5uYW1lfWA7XG4gICAgICAgIH0sXG4gICAgfTtcbn1cbmZ1bmN0aW9uIG5ld0ZpZWxkKHByb3RvLCBwYXJlbnRPckZpbGUsIHJlZywgb25lb2YsIG1hcEVudHJpZXMpIHtcbiAgICB2YXIgX2EsIF9iLCBfYztcbiAgICBjb25zdCBpc0V4dGVuc2lvbiA9IG1hcEVudHJpZXMgPT09IHVuZGVmaW5lZDtcbiAgICBjb25zdCBmaWVsZCA9IHtcbiAgICAgICAga2luZDogXCJmaWVsZFwiLFxuICAgICAgICBwcm90byxcbiAgICAgICAgZGVwcmVjYXRlZDogKF9iID0gKF9hID0gcHJvdG8ub3B0aW9ucykgPT09IG51bGwgfHwgX2EgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9hLmRlcHJlY2F0ZWQpICE9PSBudWxsICYmIF9iICE9PSB2b2lkIDAgPyBfYiA6IGZhbHNlLFxuICAgICAgICBuYW1lOiBwcm90by5uYW1lLFxuICAgICAgICBudW1iZXI6IHByb3RvLm51bWJlcixcbiAgICAgICAgc2NhbGFyOiB1bmRlZmluZWQsXG4gICAgICAgIG1lc3NhZ2U6IHVuZGVmaW5lZCxcbiAgICAgICAgZW51bTogdW5kZWZpbmVkLFxuICAgICAgICBwcmVzZW5jZTogZ2V0RmllbGRQcmVzZW5jZShwcm90bywgb25lb2YsIGlzRXh0ZW5zaW9uLCBwYXJlbnRPckZpbGUpLFxuICAgICAgICBsaXN0S2luZDogdW5kZWZpbmVkLFxuICAgICAgICBtYXBLaW5kOiB1bmRlZmluZWQsXG4gICAgICAgIG1hcEtleTogdW5kZWZpbmVkLFxuICAgICAgICBkZWxpbWl0ZWRFbmNvZGluZzogdW5kZWZpbmVkLFxuICAgICAgICBwYWNrZWQ6IHVuZGVmaW5lZCxcbiAgICAgICAgbG9uZ0FzU3RyaW5nOiBmYWxzZSxcbiAgICAgICAgZ2V0RGVmYXVsdFZhbHVlOiB1bmRlZmluZWQsXG4gICAgfTtcbiAgICBpZiAoaXNFeHRlbnNpb24pIHtcbiAgICAgICAgLy8gZXh0ZW5zaW9uIGZpZWxkXG4gICAgICAgIGNvbnN0IGZpbGUgPSBwYXJlbnRPckZpbGUua2luZCA9PSBcImZpbGVcIiA/IHBhcmVudE9yRmlsZSA6IHBhcmVudE9yRmlsZS5maWxlO1xuICAgICAgICBjb25zdCBwYXJlbnQgPSBwYXJlbnRPckZpbGUua2luZCA9PSBcImZpbGVcIiA/IHVuZGVmaW5lZCA6IHBhcmVudE9yRmlsZTtcbiAgICAgICAgY29uc3QgdHlwZU5hbWUgPSBtYWtlVHlwZU5hbWUocHJvdG8sIHBhcmVudCwgZmlsZSk7XG4gICAgICAgIGZpZWxkLmtpbmQgPSBcImV4dGVuc2lvblwiO1xuICAgICAgICBmaWVsZC5maWxlID0gZmlsZTtcbiAgICAgICAgZmllbGQucGFyZW50ID0gcGFyZW50O1xuICAgICAgICBmaWVsZC5vbmVvZiA9IHVuZGVmaW5lZDtcbiAgICAgICAgZmllbGQudHlwZU5hbWUgPSB0eXBlTmFtZTtcbiAgICAgICAgZmllbGQuanNvbk5hbWUgPSBgWyR7dHlwZU5hbWV9XWA7IC8vIG9wdGlvbiBqc29uX25hbWUgaXMgbm90IGFsbG93ZWQgb24gZXh0ZW5zaW9uIGZpZWxkc1xuICAgICAgICBmaWVsZC50b1N0cmluZyA9ICgpID0+IGBleHRlbnNpb24gJHt0eXBlTmFtZX1gO1xuICAgICAgICBjb25zdCBleHRlbmRlZSA9IHJlZy5nZXRNZXNzYWdlKHRyaW1MZWFkaW5nRG90KHByb3RvLmV4dGVuZGVlKSk7XG4gICAgICAgIGFzc2VydChleHRlbmRlZSwgYGludmFsaWQgRmllbGREZXNjcmlwdG9yUHJvdG86IGV4dGVuZGVlICR7cHJvdG8uZXh0ZW5kZWV9IG5vdCBmb3VuZGApO1xuICAgICAgICBmaWVsZC5leHRlbmRlZSA9IGV4dGVuZGVlO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgLy8gcmVndWxhciBmaWVsZFxuICAgICAgICBjb25zdCBwYXJlbnQgPSBwYXJlbnRPckZpbGU7XG4gICAgICAgIGFzc2VydChwYXJlbnQua2luZCA9PSBcIm1lc3NhZ2VcIik7XG4gICAgICAgIGZpZWxkLnBhcmVudCA9IHBhcmVudDtcbiAgICAgICAgZmllbGQub25lb2YgPSBvbmVvZjtcbiAgICAgICAgZmllbGQubG9jYWxOYW1lID0gb25lb2ZcbiAgICAgICAgICAgID8gcHJvdG9DYW1lbENhc2UocHJvdG8ubmFtZSlcbiAgICAgICAgICAgIDogc2FmZU9iamVjdFByb3BlcnR5KHByb3RvQ2FtZWxDYXNlKHByb3RvLm5hbWUpKTtcbiAgICAgICAgZmllbGQuanNvbk5hbWUgPSBwcm90by5qc29uTmFtZTtcbiAgICAgICAgZmllbGQudG9TdHJpbmcgPSAoKSA9PiBgZmllbGQgJHtwYXJlbnQudHlwZU5hbWV9LiR7cHJvdG8ubmFtZX1gO1xuICAgIH1cbiAgICBjb25zdCBsYWJlbCA9IHByb3RvLmxhYmVsO1xuICAgIGNvbnN0IHR5cGUgPSBwcm90by50eXBlO1xuICAgIGNvbnN0IGpzdHlwZSA9IChfYyA9IHByb3RvLm9wdGlvbnMpID09PSBudWxsIHx8IF9jID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfYy5qc3R5cGU7XG4gICAgaWYgKGxhYmVsID09PSBMQUJFTF9SRVBFQVRFRCkge1xuICAgICAgICAvLyBsaXN0IG9yIG1hcCBmaWVsZFxuICAgICAgICBjb25zdCBtYXBFbnRyeSA9IHR5cGUgPT0gVFlQRV9NRVNTQUdFXG4gICAgICAgICAgICA/IG1hcEVudHJpZXMgPT09IG51bGwgfHwgbWFwRW50cmllcyA9PT0gdm9pZCAwID8gdm9pZCAwIDogbWFwRW50cmllcy5nZXQodHJpbUxlYWRpbmdEb3QocHJvdG8udHlwZU5hbWUpKVxuICAgICAgICAgICAgOiB1bmRlZmluZWQ7XG4gICAgICAgIGlmIChtYXBFbnRyeSkge1xuICAgICAgICAgICAgLy8gbWFwIGZpZWxkXG4gICAgICAgICAgICBmaWVsZC5maWVsZEtpbmQgPSBcIm1hcFwiO1xuICAgICAgICAgICAgY29uc3QgeyBrZXksIHZhbHVlIH0gPSBmaW5kTWFwRW50cnlGaWVsZHMobWFwRW50cnkpO1xuICAgICAgICAgICAgZmllbGQubWFwS2V5ID0ga2V5LnNjYWxhcjtcbiAgICAgICAgICAgIGZpZWxkLm1hcEtpbmQgPSB2YWx1ZS5maWVsZEtpbmQ7XG4gICAgICAgICAgICBmaWVsZC5tZXNzYWdlID0gdmFsdWUubWVzc2FnZTtcbiAgICAgICAgICAgIGZpZWxkLmRlbGltaXRlZEVuY29kaW5nID0gZmFsc2U7IC8vIG1hcCBmaWVsZHMgYXJlIGFsd2F5cyBMRU5HVEhfUFJFRklYRURcbiAgICAgICAgICAgIGZpZWxkLmVudW0gPSB2YWx1ZS5lbnVtO1xuICAgICAgICAgICAgZmllbGQuc2NhbGFyID0gdmFsdWUuc2NhbGFyO1xuICAgICAgICAgICAgcmV0dXJuIGZpZWxkO1xuICAgICAgICB9XG4gICAgICAgIC8vIGxpc3QgZmllbGRcbiAgICAgICAgZmllbGQuZmllbGRLaW5kID0gXCJsaXN0XCI7XG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgY2FzZSBUWVBFX01FU1NBR0U6XG4gICAgICAgICAgICBjYXNlIFRZUEVfR1JPVVA6XG4gICAgICAgICAgICAgICAgZmllbGQubGlzdEtpbmQgPSBcIm1lc3NhZ2VcIjtcbiAgICAgICAgICAgICAgICBmaWVsZC5tZXNzYWdlID0gcmVnLmdldE1lc3NhZ2UodHJpbUxlYWRpbmdEb3QocHJvdG8udHlwZU5hbWUpKTtcbiAgICAgICAgICAgICAgICBhc3NlcnQoZmllbGQubWVzc2FnZSk7XG4gICAgICAgICAgICAgICAgZmllbGQuZGVsaW1pdGVkRW5jb2RpbmcgPSBpc0RlbGltaXRlZEVuY29kaW5nKHByb3RvLCBwYXJlbnRPckZpbGUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBUWVBFX0VOVU06XG4gICAgICAgICAgICAgICAgZmllbGQubGlzdEtpbmQgPSBcImVudW1cIjtcbiAgICAgICAgICAgICAgICBmaWVsZC5lbnVtID0gcmVnLmdldEVudW0odHJpbUxlYWRpbmdEb3QocHJvdG8udHlwZU5hbWUpKTtcbiAgICAgICAgICAgICAgICBhc3NlcnQoZmllbGQuZW51bSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIGZpZWxkLmxpc3RLaW5kID0gXCJzY2FsYXJcIjtcbiAgICAgICAgICAgICAgICBmaWVsZC5zY2FsYXIgPSB0eXBlO1xuICAgICAgICAgICAgICAgIGZpZWxkLmxvbmdBc1N0cmluZyA9IGpzdHlwZSA9PSBKU19TVFJJTkc7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgZmllbGQucGFja2VkID0gaXNQYWNrZWRGaWVsZChwcm90bywgcGFyZW50T3JGaWxlKTtcbiAgICAgICAgcmV0dXJuIGZpZWxkO1xuICAgIH1cbiAgICAvLyBzaW5ndWxhclxuICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICBjYXNlIFRZUEVfTUVTU0FHRTpcbiAgICAgICAgY2FzZSBUWVBFX0dST1VQOlxuICAgICAgICAgICAgZmllbGQuZmllbGRLaW5kID0gXCJtZXNzYWdlXCI7XG4gICAgICAgICAgICBmaWVsZC5tZXNzYWdlID0gcmVnLmdldE1lc3NhZ2UodHJpbUxlYWRpbmdEb3QocHJvdG8udHlwZU5hbWUpKTtcbiAgICAgICAgICAgIGFzc2VydChmaWVsZC5tZXNzYWdlLCBgaW52YWxpZCBGaWVsZERlc2NyaXB0b3JQcm90bzogdHlwZV9uYW1lICR7cHJvdG8udHlwZU5hbWV9IG5vdCBmb3VuZGApO1xuICAgICAgICAgICAgZmllbGQuZGVsaW1pdGVkRW5jb2RpbmcgPSBpc0RlbGltaXRlZEVuY29kaW5nKHByb3RvLCBwYXJlbnRPckZpbGUpO1xuICAgICAgICAgICAgZmllbGQuZ2V0RGVmYXVsdFZhbHVlID0gKCkgPT4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgVFlQRV9FTlVNOiB7XG4gICAgICAgICAgICBjb25zdCBlbnVtZXJhdGlvbiA9IHJlZy5nZXRFbnVtKHRyaW1MZWFkaW5nRG90KHByb3RvLnR5cGVOYW1lKSk7XG4gICAgICAgICAgICBhc3NlcnQoZW51bWVyYXRpb24gIT09IHVuZGVmaW5lZCwgYGludmFsaWQgRmllbGREZXNjcmlwdG9yUHJvdG86IHR5cGVfbmFtZSAke3Byb3RvLnR5cGVOYW1lfSBub3QgZm91bmRgKTtcbiAgICAgICAgICAgIGZpZWxkLmZpZWxkS2luZCA9IFwiZW51bVwiO1xuICAgICAgICAgICAgZmllbGQuZW51bSA9IHJlZy5nZXRFbnVtKHRyaW1MZWFkaW5nRG90KHByb3RvLnR5cGVOYW1lKSk7XG4gICAgICAgICAgICBmaWVsZC5nZXREZWZhdWx0VmFsdWUgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHVuc2FmZUlzU2V0RXhwbGljaXQocHJvdG8sIFwiZGVmYXVsdFZhbHVlXCIpXG4gICAgICAgICAgICAgICAgICAgID8gcGFyc2VUZXh0Rm9ybWF0RW51bVZhbHVlKGVudW1lcmF0aW9uLCBwcm90by5kZWZhdWx0VmFsdWUpXG4gICAgICAgICAgICAgICAgICAgIDogdW5kZWZpbmVkO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGRlZmF1bHQ6IHtcbiAgICAgICAgICAgIGZpZWxkLmZpZWxkS2luZCA9IFwic2NhbGFyXCI7XG4gICAgICAgICAgICBmaWVsZC5zY2FsYXIgPSB0eXBlO1xuICAgICAgICAgICAgZmllbGQubG9uZ0FzU3RyaW5nID0ganN0eXBlID09IEpTX1NUUklORztcbiAgICAgICAgICAgIGZpZWxkLmdldERlZmF1bHRWYWx1ZSA9ICgpID0+IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdW5zYWZlSXNTZXRFeHBsaWNpdChwcm90bywgXCJkZWZhdWx0VmFsdWVcIilcbiAgICAgICAgICAgICAgICAgICAgPyBwYXJzZVRleHRGb3JtYXRTY2FsYXJWYWx1ZSh0eXBlLCBwcm90by5kZWZhdWx0VmFsdWUpXG4gICAgICAgICAgICAgICAgICAgIDogdW5kZWZpbmVkO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmaWVsZDtcbn1cbi8qKlxuICogUGFyc2UgdGhlIFwic3ludGF4XCIgYW5kIFwiZWRpdGlvblwiIGZpZWxkcywgcmV0dXJuaW5nIG9uZSBvZiB0aGUgc3VwcG9ydGVkXG4gKiBlZGl0aW9ucy5cbiAqL1xuZnVuY3Rpb24gZ2V0RmlsZUVkaXRpb24ocHJvdG8pIHtcbiAgICBzd2l0Y2ggKHByb3RvLnN5bnRheCkge1xuICAgICAgICBjYXNlIFwiXCI6XG4gICAgICAgIGNhc2UgXCJwcm90bzJcIjpcbiAgICAgICAgICAgIHJldHVybiBFRElUSU9OX1BST1RPMjtcbiAgICAgICAgY2FzZSBcInByb3RvM1wiOlxuICAgICAgICAgICAgcmV0dXJuIEVESVRJT05fUFJPVE8zO1xuICAgICAgICBjYXNlIFwiZWRpdGlvbnNcIjpcbiAgICAgICAgICAgIGlmIChwcm90by5lZGl0aW9uIGluIGZlYXR1cmVEZWZhdWx0cykge1xuICAgICAgICAgICAgICAgIHJldHVybiBwcm90by5lZGl0aW9uO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3Byb3RvLm5hbWV9OiB1bnN1cHBvcnRlZCBlZGl0aW9uYCk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7cHJvdG8ubmFtZX06IHVuc3VwcG9ydGVkIHN5bnRheCBcIiR7cHJvdG8uc3ludGF4fVwiYCk7XG4gICAgfVxufVxuLyoqXG4gKiBSZXNvbHZlIGRlcGVuZGVuY2llcyBvZiBGaWxlRGVzY3JpcHRvclByb3RvIHRvIERlc2NGaWxlLlxuICovXG5mdW5jdGlvbiBmaW5kRmlsZURlcGVuZGVuY2llcyhwcm90bywgcmVnKSB7XG4gICAgcmV0dXJuIHByb3RvLmRlcGVuZGVuY3kubWFwKCh3YW50TmFtZSkgPT4ge1xuICAgICAgICBjb25zdCBkZXAgPSByZWcuZ2V0RmlsZSh3YW50TmFtZSk7XG4gICAgICAgIGlmICghZGVwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBmaW5kICR7d2FudE5hbWV9LCBpbXBvcnRlZCBieSAke3Byb3RvLm5hbWV9YCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRlcDtcbiAgICB9KTtcbn1cbi8qKlxuICogRmluZHMgYSBwcmVmaXggc2hhcmVkIGJ5IGVudW0gdmFsdWVzLCBmb3IgZXhhbXBsZSBgbXlfZW51bV9gIGZvclxuICogYGVudW0gTXlFbnVtIHtNWV9FTlVNX0E9MDsgTVlfRU5VTV9CPTE7fWAuXG4gKi9cbmZ1bmN0aW9uIGZpbmRFbnVtU2hhcmVkUHJlZml4KGVudW1OYW1lLCB2YWx1ZXMpIHtcbiAgICBjb25zdCBwcmVmaXggPSBjYW1lbFRvU25ha2VDYXNlKGVudW1OYW1lKSArIFwiX1wiO1xuICAgIGZvciAoY29uc3QgdmFsdWUgb2YgdmFsdWVzKSB7XG4gICAgICAgIGlmICghdmFsdWUubmFtZS50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgocHJlZml4KSkge1xuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzaG9ydE5hbWUgPSB2YWx1ZS5uYW1lLnN1YnN0cmluZyhwcmVmaXgubGVuZ3RoKTtcbiAgICAgICAgaWYgKHNob3J0TmFtZS5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoL15cXGQvLnRlc3Qoc2hvcnROYW1lKSkge1xuICAgICAgICAgICAgLy8gaWRlbnRpZmllcnMgbXVzdCBub3Qgc3RhcnQgd2l0aCBudW1iZXJzXG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBwcmVmaXg7XG59XG4vKipcbiAqIENvbnZlcnRzIGxvd2VyQ2FtZWxDYXNlIG9yIFVwcGVyQ2FtZWxDYXNlIGludG8gbG93ZXJfc25ha2VfY2FzZS5cbiAqIFRoaXMgaXMgdXNlZCB0byBmaW5kIHNoYXJlZCBwcmVmaXhlcyBpbiBhbiBlbnVtLlxuICovXG5mdW5jdGlvbiBjYW1lbFRvU25ha2VDYXNlKGNhbWVsKSB7XG4gICAgcmV0dXJuIChjYW1lbC5zdWJzdHJpbmcoMCwgMSkgKyBjYW1lbC5zdWJzdHJpbmcoMSkucmVwbGFjZSgvW0EtWl0vZywgKGMpID0+IFwiX1wiICsgYykpLnRvTG93ZXJDYXNlKCk7XG59XG4vKipcbiAqIENyZWF0ZSBhIGZ1bGx5IHF1YWxpZmllZCBuYW1lIGZvciBhIHByb3RvYnVmIHR5cGUgb3IgZXh0ZW5zaW9uIGZpZWxkLlxuICpcbiAqIFRoZSBmdWxseSBxdWFsaWZpZWQgbmFtZSBmb3IgbWVzc2FnZXMsIGVudW1lcmF0aW9ucywgYW5kIHNlcnZpY2VzIGlzXG4gKiBjb25zdHJ1Y3RlZCBieSBjb25jYXRlbmF0aW5nIHRoZSBwYWNrYWdlIG5hbWUgKGlmIHByZXNlbnQpLCBwYXJlbnRcbiAqIG1lc3NhZ2UgbmFtZXMgKGZvciBuZXN0ZWQgdHlwZXMpLCBhbmQgdGhlIHR5cGUgbmFtZS4gV2Ugb21pdCB0aGUgbGVhZGluZ1xuICogZG90IGFkZGVkIGJ5IHByb3RvYnVmIGNvbXBpbGVycy4gRXhhbXBsZXM6XG4gKiAtIG15cGFja2FnZS5NeU1lc3NhZ2VcbiAqIC0gbXlwYWNrYWdlLk15TWVzc2FnZS5OZXN0ZWRNZXNzYWdlXG4gKlxuICogVGhlIGZ1bGx5IHF1YWxpZmllZCBuYW1lIGZvciBleHRlbnNpb24gZmllbGRzIGlzIGNvbnN0cnVjdGVkIGJ5XG4gKiBjb25jYXRlbmF0aW5nIHRoZSBwYWNrYWdlIG5hbWUgKGlmIHByZXNlbnQpLCBwYXJlbnQgbWVzc2FnZSBuYW1lcyAoZm9yXG4gKiBleHRlbnNpb25zIGRlY2xhcmVkIHdpdGhpbiBhIG1lc3NhZ2UpLCBhbmQgdGhlIGZpZWxkIG5hbWUuIEV4YW1wbGVzOlxuICogLSBteXBhY2thZ2UuZXh0ZmllbGRcbiAqIC0gbXlwYWNrYWdlLk15TWVzc2FnZS5leHRmaWVsZFxuICovXG5mdW5jdGlvbiBtYWtlVHlwZU5hbWUocHJvdG8sIHBhcmVudCwgZmlsZSkge1xuICAgIGxldCB0eXBlTmFtZTtcbiAgICBpZiAocGFyZW50KSB7XG4gICAgICAgIHR5cGVOYW1lID0gYCR7cGFyZW50LnR5cGVOYW1lfS4ke3Byb3RvLm5hbWV9YDtcbiAgICB9XG4gICAgZWxzZSBpZiAoZmlsZS5wcm90by5wYWNrYWdlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdHlwZU5hbWUgPSBgJHtmaWxlLnByb3RvLnBhY2thZ2V9LiR7cHJvdG8ubmFtZX1gO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgdHlwZU5hbWUgPSBgJHtwcm90by5uYW1lfWA7XG4gICAgfVxuICAgIHJldHVybiB0eXBlTmFtZTtcbn1cbi8qKlxuICogUmVtb3ZlIHRoZSBsZWFkaW5nIGRvdCBmcm9tIGEgZnVsbHkgcXVhbGlmaWVkIHR5cGUgbmFtZS5cbiAqL1xuZnVuY3Rpb24gdHJpbUxlYWRpbmdEb3QodHlwZU5hbWUpIHtcbiAgICByZXR1cm4gdHlwZU5hbWUuc3RhcnRzV2l0aChcIi5cIikgPyB0eXBlTmFtZS5zdWJzdHJpbmcoMSkgOiB0eXBlTmFtZTtcbn1cbi8qKlxuICogRGlkIHRoZSB1c2VyIHB1dCB0aGUgZmllbGQgaW4gYSBvbmVvZiBncm91cD9cbiAqIFN5bnRoZXRpYyBvbmVvZnMgZm9yIHByb3RvMyBvcHRpb25hbHMgYXJlIGlnbm9yZWQuXG4gKi9cbmZ1bmN0aW9uIGZpbmRPbmVvZihwcm90bywgYWxsT25lb2ZzKSB7XG4gICAgaWYgKCF1bnNhZmVJc1NldEV4cGxpY2l0KHByb3RvLCBcIm9uZW9mSW5kZXhcIikpIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgaWYgKHByb3RvLnByb3RvM09wdGlvbmFsKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGNvbnN0IG9uZW9mID0gYWxsT25lb2ZzW3Byb3RvLm9uZW9mSW5kZXhdO1xuICAgIGFzc2VydChvbmVvZiwgYGludmFsaWQgRmllbGREZXNjcmlwdG9yUHJvdG86IG9uZW9mICMke3Byb3RvLm9uZW9mSW5kZXh9IGZvciBmaWVsZCAjJHtwcm90by5udW1iZXJ9IG5vdCBmb3VuZGApO1xuICAgIHJldHVybiBvbmVvZjtcbn1cbi8qKlxuICogUHJlc2VuY2Ugb2YgdGhlIGZpZWxkLlxuICogU2VlIGh0dHBzOi8vcHJvdG9idWYuZGV2L3Byb2dyYW1taW5nLWd1aWRlcy9maWVsZF9wcmVzZW5jZS9cbiAqL1xuZnVuY3Rpb24gZ2V0RmllbGRQcmVzZW5jZShwcm90bywgb25lb2YsIGlzRXh0ZW5zaW9uLCBwYXJlbnQpIHtcbiAgICBpZiAocHJvdG8ubGFiZWwgPT0gTEFCRUxfUkVRVUlSRUQpIHtcbiAgICAgICAgLy8gcHJvdG8yIHJlcXVpcmVkIGlzIExFR0FDWV9SRVFVSVJFRFxuICAgICAgICByZXR1cm4gTEVHQUNZX1JFUVVJUkVEO1xuICAgIH1cbiAgICBpZiAocHJvdG8ubGFiZWwgPT0gTEFCRUxfUkVQRUFURUQpIHtcbiAgICAgICAgLy8gcmVwZWF0ZWQgZmllbGRzIChpbmNsdWRpbmcgbWFwcykgZG8gbm90IHRyYWNrIHByZXNlbmNlXG4gICAgICAgIHJldHVybiBJTVBMSUNJVDtcbiAgICB9XG4gICAgaWYgKCEhb25lb2YgfHwgcHJvdG8ucHJvdG8zT3B0aW9uYWwpIHtcbiAgICAgICAgLy8gb25lb2YgaXMgYWx3YXlzIGV4cGxpY2l0XG4gICAgICAgIHJldHVybiBFWFBMSUNJVDtcbiAgICB9XG4gICAgaWYgKGlzRXh0ZW5zaW9uKSB7XG4gICAgICAgIC8vIGV4dGVuc2lvbnMgYWx3YXlzIHRyYWNrIHByZXNlbmNlXG4gICAgICAgIHJldHVybiBFWFBMSUNJVDtcbiAgICB9XG4gICAgY29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlRmVhdHVyZShcImZpZWxkUHJlc2VuY2VcIiwgeyBwcm90bywgcGFyZW50IH0pO1xuICAgIGlmIChyZXNvbHZlZCA9PSBJTVBMSUNJVCAmJlxuICAgICAgICAocHJvdG8udHlwZSA9PSBUWVBFX01FU1NBR0UgfHwgcHJvdG8udHlwZSA9PSBUWVBFX0dST1VQKSkge1xuICAgICAgICAvLyBzaW5ndWxhciBtZXNzYWdlIGZpZWxkIGNhbm5vdCBiZSBpbXBsaWNpdFxuICAgICAgICByZXR1cm4gRVhQTElDSVQ7XG4gICAgfVxuICAgIHJldHVybiByZXNvbHZlZDtcbn1cbi8qKlxuICogUGFjayB0aGlzIHJlcGVhdGVkIGZpZWxkP1xuICovXG5mdW5jdGlvbiBpc1BhY2tlZEZpZWxkKHByb3RvLCBwYXJlbnQpIHtcbiAgICBpZiAocHJvdG8ubGFiZWwgIT0gTEFCRUxfUkVQRUFURUQpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBzd2l0Y2ggKHByb3RvLnR5cGUpIHtcbiAgICAgICAgY2FzZSBUWVBFX1NUUklORzpcbiAgICAgICAgY2FzZSBUWVBFX0JZVEVTOlxuICAgICAgICBjYXNlIFRZUEVfR1JPVVA6XG4gICAgICAgIGNhc2UgVFlQRV9NRVNTQUdFOlxuICAgICAgICAgICAgLy8gbGVuZ3RoLWRlbGltaXRlZCB0eXBlcyBjYW5ub3QgYmUgcGFja2VkXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNvbnN0IG8gPSBwcm90by5vcHRpb25zO1xuICAgIGlmIChvICYmIHVuc2FmZUlzU2V0RXhwbGljaXQobywgXCJwYWNrZWRcIikpIHtcbiAgICAgICAgLy8gcHJlZmVyIHRoZSBmaWVsZCBvcHRpb24gb3ZlciBlZGl0aW9uIGZlYXR1cmVzXG4gICAgICAgIHJldHVybiBvLnBhY2tlZDtcbiAgICB9XG4gICAgcmV0dXJuIChQQUNLRUQgPT1cbiAgICAgICAgcmVzb2x2ZUZlYXR1cmUoXCJyZXBlYXRlZEZpZWxkRW5jb2RpbmdcIiwge1xuICAgICAgICAgICAgcHJvdG8sXG4gICAgICAgICAgICBwYXJlbnQsXG4gICAgICAgIH0pKTtcbn1cbi8qKlxuICogRmluZCB0aGUga2V5IGFuZCB2YWx1ZSBmaWVsZHMgb2YgYSBzeW50aGV0aWMgbWFwIGVudHJ5IG1lc3NhZ2UuXG4gKi9cbmZ1bmN0aW9uIGZpbmRNYXBFbnRyeUZpZWxkcyhtYXBFbnRyeSkge1xuICAgIGNvbnN0IGtleSA9IG1hcEVudHJ5LmZpZWxkcy5maW5kKChmKSA9PiBmLm51bWJlciA9PT0gMSk7XG4gICAgY29uc3QgdmFsdWUgPSBtYXBFbnRyeS5maWVsZHMuZmluZCgoZikgPT4gZi5udW1iZXIgPT09IDIpO1xuICAgIGFzc2VydChrZXkgJiZcbiAgICAgICAga2V5LmZpZWxkS2luZCA9PSBcInNjYWxhclwiICYmXG4gICAgICAgIGtleS5zY2FsYXIgIT0gU2NhbGFyVHlwZS5CWVRFUyAmJlxuICAgICAgICBrZXkuc2NhbGFyICE9IFNjYWxhclR5cGUuRkxPQVQgJiZcbiAgICAgICAga2V5LnNjYWxhciAhPSBTY2FsYXJUeXBlLkRPVUJMRSAmJlxuICAgICAgICB2YWx1ZSAmJlxuICAgICAgICB2YWx1ZS5maWVsZEtpbmQgIT0gXCJsaXN0XCIgJiZcbiAgICAgICAgdmFsdWUuZmllbGRLaW5kICE9IFwibWFwXCIpO1xuICAgIHJldHVybiB7IGtleSwgdmFsdWUgfTtcbn1cbi8qKlxuICogRW51bWVyYXRpb25zIGNhbiBiZSBvcGVuIG9yIGNsb3NlZC5cbiAqIFNlZSBodHRwczovL3Byb3RvYnVmLmRldi9wcm9ncmFtbWluZy1ndWlkZXMvZW51bS9cbiAqL1xuZnVuY3Rpb24gaXNFbnVtT3BlbihkZXNjKSB7XG4gICAgdmFyIF9hO1xuICAgIHJldHVybiAoT1BFTiA9PVxuICAgICAgICByZXNvbHZlRmVhdHVyZShcImVudW1UeXBlXCIsIHtcbiAgICAgICAgICAgIHByb3RvOiBkZXNjLnByb3RvLFxuICAgICAgICAgICAgcGFyZW50OiAoX2EgPSBkZXNjLnBhcmVudCkgIT09IG51bGwgJiYgX2EgIT09IHZvaWQgMCA/IF9hIDogZGVzYy5maWxlLFxuICAgICAgICB9KSk7XG59XG4vKipcbiAqIEVuY29kZSB0aGUgbWVzc2FnZSBkZWxpbWl0ZWQgKGEuay5hLiBwcm90bzIgZ3JvdXAgZW5jb2RpbmcpLCBvclxuICogbGVuZ3RoLXByZWZpeGVkP1xuICovXG5mdW5jdGlvbiBpc0RlbGltaXRlZEVuY29kaW5nKHByb3RvLCBwYXJlbnQpIHtcbiAgICBpZiAocHJvdG8udHlwZSA9PSBUWVBFX0dST1VQKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gKERFTElNSVRFRCA9PVxuICAgICAgICByZXNvbHZlRmVhdHVyZShcIm1lc3NhZ2VFbmNvZGluZ1wiLCB7XG4gICAgICAgICAgICBwcm90byxcbiAgICAgICAgICAgIHBhcmVudCxcbiAgICAgICAgfSkpO1xufVxuZnVuY3Rpb24gcmVzb2x2ZUZlYXR1cmUobmFtZSwgcmVmKSB7XG4gICAgdmFyIF9hLCBfYjtcbiAgICBjb25zdCBmZWF0dXJlU2V0ID0gKF9hID0gcmVmLnByb3RvLm9wdGlvbnMpID09PSBudWxsIHx8IF9hID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfYS5mZWF0dXJlcztcbiAgICBpZiAoZmVhdHVyZVNldCkge1xuICAgICAgICBjb25zdCB2YWwgPSBmZWF0dXJlU2V0W25hbWVdO1xuICAgICAgICBpZiAodmFsICE9IDApIHtcbiAgICAgICAgICAgIHJldHVybiB2YWw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKFwia2luZFwiIGluIHJlZikge1xuICAgICAgICBpZiAocmVmLmtpbmQgPT0gXCJtZXNzYWdlXCIpIHtcbiAgICAgICAgICAgIHJldHVybiByZXNvbHZlRmVhdHVyZShuYW1lLCAoX2IgPSByZWYucGFyZW50KSAhPT0gbnVsbCAmJiBfYiAhPT0gdm9pZCAwID8gX2IgOiByZWYuZmlsZSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZWRpdGlvbkRlZmF1bHRzID0gZmVhdHVyZURlZmF1bHRzW3JlZi5lZGl0aW9uXTtcbiAgICAgICAgaWYgKCFlZGl0aW9uRGVmYXVsdHMpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgZmVhdHVyZSBkZWZhdWx0IGZvciBlZGl0aW9uICR7cmVmLmVkaXRpb259IG5vdCBmb3VuZGApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBlZGl0aW9uRGVmYXVsdHNbbmFtZV07XG4gICAgfVxuICAgIHJldHVybiByZXNvbHZlRmVhdHVyZShuYW1lLCByZWYucGFyZW50KTtcbn1cbi8qKlxuICogQXNzZXJ0IHRoYXQgY29uZGl0aW9uIGlzIHRydXRoeSBvciB0aHJvdyBlcnJvciAod2l0aCBtZXNzYWdlKVxuICovXG5mdW5jdGlvbiBhc3NlcnQoY29uZGl0aW9uLCBtc2cpIHtcbiAgICBpZiAoIWNvbmRpdGlvbikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobXNnKTtcbiAgICB9XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbmltcG9ydCB7IHJlc3RvcmVKc29uTmFtZXMgfSBmcm9tIFwiLi9yZXN0b3JlLWpzb24tbmFtZXMuanNcIjtcbmltcG9ydCB7IGNyZWF0ZUZpbGVSZWdpc3RyeSB9IGZyb20gXCIuLi9yZWdpc3RyeS5qc1wiO1xuLyoqXG4gKiBIeWRyYXRlIGEgZmlsZSBkZXNjcmlwdG9yIGZvciBnb29nbGUvcHJvdG9idWYvZGVzY3JpcHRvci5wcm90byBmcm9tIGEgcGxhaW5cbiAqIG9iamVjdC5cbiAqXG4gKiBTZWUgY3JlYXRlRmlsZURlc2NyaXB0b3JQcm90b0Jvb3QoKSBmb3IgZGV0YWlscy5cbiAqXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gYm9vdChib290KSB7XG4gICAgY29uc3Qgcm9vdCA9IGJvb3RGaWxlRGVzY3JpcHRvclByb3RvKGJvb3QpO1xuICAgIHJvb3QubWVzc2FnZVR5cGUuZm9yRWFjaChyZXN0b3JlSnNvbk5hbWVzKTtcbiAgICBjb25zdCByZWcgPSBjcmVhdGVGaWxlUmVnaXN0cnkocm9vdCwgKCkgPT4gdW5kZWZpbmVkKTtcbiAgICAvLyBiaW9tZS1pZ25vcmUgbGludC9zdHlsZS9ub05vbk51bGxBc3NlcnRpb246IG5vbi1udWxsIGFzc2VydGlvbiBiZWNhdXNlIHdlIGp1c3QgY3JlYXRlZCB0aGUgcmVnaXN0cnkgZnJvbSB0aGUgZmlsZSB3ZSBsb29rIHVwXG4gICAgcmV0dXJuIHJlZy5nZXRGaWxlKHJvb3QubmFtZSk7XG59XG4vKipcbiAqIENyZWF0ZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLkZpbGVEZXNjcmlwdG9yUHJvdG8gZnJvbSBhbiBvYmplY3QgbGl0ZXJhbC5cbiAqXG4gKiBTZWUgY3JlYXRlRmlsZURlc2NyaXB0b3JQcm90b0Jvb3QoKSBmb3IgZGV0YWlscy5cbiAqXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gYm9vdEZpbGVEZXNjcmlwdG9yUHJvdG8oaW5pdCkge1xuICAgIGNvbnN0IHByb3RvID0gT2JqZWN0LmNyZWF0ZSh7XG4gICAgICAgIHN5bnRheDogXCJcIixcbiAgICAgICAgZWRpdGlvbjogMCxcbiAgICB9KTtcbiAgICByZXR1cm4gT2JqZWN0LmFzc2lnbihwcm90bywgT2JqZWN0LmFzc2lnbihPYmplY3QuYXNzaWduKHsgJHR5cGVOYW1lOiBcImdvb2dsZS5wcm90b2J1Zi5GaWxlRGVzY3JpcHRvclByb3RvXCIsIGRlcGVuZGVuY3k6IFtdLCBwdWJsaWNEZXBlbmRlbmN5OiBbXSwgd2Vha0RlcGVuZGVuY3k6IFtdLCBvcHRpb25EZXBlbmRlbmN5OiBbXSwgc2VydmljZTogW10sIGV4dGVuc2lvbjogW10gfSwgaW5pdCksIHsgbWVzc2FnZVR5cGU6IGluaXQubWVzc2FnZVR5cGUubWFwKGJvb3REZXNjcmlwdG9yUHJvdG8pLCBlbnVtVHlwZTogaW5pdC5lbnVtVHlwZS5tYXAoYm9vdEVudW1EZXNjcmlwdG9yUHJvdG8pIH0pKTtcbn1cbmZ1bmN0aW9uIGJvb3REZXNjcmlwdG9yUHJvdG8oaW5pdCkge1xuICAgIHZhciBfYSwgX2IsIF9jLCBfZCwgX2UsIF9mLCBfZywgX2g7XG4gICAgY29uc3QgcHJvdG8gPSBPYmplY3QuY3JlYXRlKHtcbiAgICAgICAgdmlzaWJpbGl0eTogMCxcbiAgICB9KTtcbiAgICByZXR1cm4gT2JqZWN0LmFzc2lnbihwcm90bywge1xuICAgICAgICAkdHlwZU5hbWU6IFwiZ29vZ2xlLnByb3RvYnVmLkRlc2NyaXB0b3JQcm90b1wiLFxuICAgICAgICBuYW1lOiBpbml0Lm5hbWUsXG4gICAgICAgIGZpZWxkOiAoX2IgPSAoX2EgPSBpbml0LmZpZWxkKSA9PT0gbnVsbCB8fCBfYSA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2EubWFwKGJvb3RGaWVsZERlc2NyaXB0b3JQcm90bykpICE9PSBudWxsICYmIF9iICE9PSB2b2lkIDAgPyBfYiA6IFtdLFxuICAgICAgICBleHRlbnNpb246IFtdLFxuICAgICAgICBuZXN0ZWRUeXBlOiAoX2QgPSAoX2MgPSBpbml0Lm5lc3RlZFR5cGUpID09PSBudWxsIHx8IF9jID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfYy5tYXAoYm9vdERlc2NyaXB0b3JQcm90bykpICE9PSBudWxsICYmIF9kICE9PSB2b2lkIDAgPyBfZCA6IFtdLFxuICAgICAgICBlbnVtVHlwZTogKF9mID0gKF9lID0gaW5pdC5lbnVtVHlwZSkgPT09IG51bGwgfHwgX2UgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9lLm1hcChib290RW51bURlc2NyaXB0b3JQcm90bykpICE9PSBudWxsICYmIF9mICE9PSB2b2lkIDAgPyBfZiA6IFtdLFxuICAgICAgICBleHRlbnNpb25SYW5nZTogKF9oID0gKF9nID0gaW5pdC5leHRlbnNpb25SYW5nZSkgPT09IG51bGwgfHwgX2cgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9nLm1hcCgoZSkgPT4gKE9iamVjdC5hc3NpZ24oeyAkdHlwZU5hbWU6IFwiZ29vZ2xlLnByb3RvYnVmLkRlc2NyaXB0b3JQcm90by5FeHRlbnNpb25SYW5nZVwiIH0sIGUpKSkpICE9PSBudWxsICYmIF9oICE9PSB2b2lkIDAgPyBfaCA6IFtdLFxuICAgICAgICBvbmVvZkRlY2w6IFtdLFxuICAgICAgICByZXNlcnZlZFJhbmdlOiBbXSxcbiAgICAgICAgcmVzZXJ2ZWROYW1lOiBbXSxcbiAgICB9KTtcbn1cbmZ1bmN0aW9uIGJvb3RGaWVsZERlc2NyaXB0b3JQcm90byhpbml0KSB7XG4gICAgY29uc3QgcHJvdG8gPSBPYmplY3QuY3JlYXRlKHtcbiAgICAgICAgbGFiZWw6IDEsXG4gICAgICAgIHR5cGVOYW1lOiBcIlwiLFxuICAgICAgICBleHRlbmRlZTogXCJcIixcbiAgICAgICAgZGVmYXVsdFZhbHVlOiBcIlwiLFxuICAgICAgICBvbmVvZkluZGV4OiAwLFxuICAgICAgICBqc29uTmFtZTogXCJcIixcbiAgICAgICAgcHJvdG8zT3B0aW9uYWw6IGZhbHNlLFxuICAgIH0pO1xuICAgIHJldHVybiBPYmplY3QuYXNzaWduKHByb3RvLCBPYmplY3QuYXNzaWduKE9iamVjdC5hc3NpZ24oeyAkdHlwZU5hbWU6IFwiZ29vZ2xlLnByb3RvYnVmLkZpZWxkRGVzY3JpcHRvclByb3RvXCIgfSwgaW5pdCksIHsgb3B0aW9uczogaW5pdC5vcHRpb25zID8gYm9vdEZpZWxkT3B0aW9ucyhpbml0Lm9wdGlvbnMpIDogdW5kZWZpbmVkIH0pKTtcbn1cbmZ1bmN0aW9uIGJvb3RGaWVsZE9wdGlvbnMoaW5pdCkge1xuICAgIHZhciBfYSwgX2IsIF9jO1xuICAgIGNvbnN0IHByb3RvID0gT2JqZWN0LmNyZWF0ZSh7XG4gICAgICAgIGN0eXBlOiAwLFxuICAgICAgICBwYWNrZWQ6IGZhbHNlLFxuICAgICAgICBqc3R5cGU6IDAsXG4gICAgICAgIGxhenk6IGZhbHNlLFxuICAgICAgICB1bnZlcmlmaWVkTGF6eTogZmFsc2UsXG4gICAgICAgIGRlcHJlY2F0ZWQ6IGZhbHNlLFxuICAgICAgICB3ZWFrOiBmYWxzZSxcbiAgICAgICAgZGVidWdSZWRhY3Q6IGZhbHNlLFxuICAgICAgICByZXRlbnRpb246IDAsXG4gICAgfSk7XG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24ocHJvdG8sIE9iamVjdC5hc3NpZ24oT2JqZWN0LmFzc2lnbih7ICR0eXBlTmFtZTogXCJnb29nbGUucHJvdG9idWYuRmllbGRPcHRpb25zXCIgfSwgaW5pdCksIHsgdGFyZ2V0czogKF9hID0gaW5pdC50YXJnZXRzKSAhPT0gbnVsbCAmJiBfYSAhPT0gdm9pZCAwID8gX2EgOiBbXSwgZWRpdGlvbkRlZmF1bHRzOiAoX2MgPSAoX2IgPSBpbml0LmVkaXRpb25EZWZhdWx0cykgPT09IG51bGwgfHwgX2IgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9iLm1hcCgoZSkgPT4gKE9iamVjdC5hc3NpZ24oeyAkdHlwZU5hbWU6IFwiZ29vZ2xlLnByb3RvYnVmLkZpZWxkT3B0aW9ucy5FZGl0aW9uRGVmYXVsdFwiIH0sIGUpKSkpICE9PSBudWxsICYmIF9jICE9PSB2b2lkIDAgPyBfYyA6IFtdLCB1bmludGVycHJldGVkT3B0aW9uOiBbXSB9KSk7XG59XG5mdW5jdGlvbiBib290RW51bURlc2NyaXB0b3JQcm90byhpbml0KSB7XG4gICAgY29uc3QgcHJvdG8gPSBPYmplY3QuY3JlYXRlKHtcbiAgICAgICAgdmlzaWJpbGl0eTogMCxcbiAgICB9KTtcbiAgICByZXR1cm4gT2JqZWN0LmFzc2lnbihwcm90bywge1xuICAgICAgICAkdHlwZU5hbWU6IFwiZ29vZ2xlLnByb3RvYnVmLkVudW1EZXNjcmlwdG9yUHJvdG9cIixcbiAgICAgICAgbmFtZTogaW5pdC5uYW1lLFxuICAgICAgICByZXNlcnZlZE5hbWU6IFtdLFxuICAgICAgICByZXNlcnZlZFJhbmdlOiBbXSxcbiAgICAgICAgdmFsdWU6IGluaXQudmFsdWUubWFwKChlKSA9PiAoT2JqZWN0LmFzc2lnbih7ICR0eXBlTmFtZTogXCJnb29nbGUucHJvdG9idWYuRW51bVZhbHVlRGVzY3JpcHRvclByb3RvXCIgfSwgZSkpKSxcbiAgICB9KTtcbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuLyoqXG4gKiBIeWRyYXRlIGEgbWVzc2FnZSBkZXNjcmlwdG9yLlxuICpcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXNzYWdlRGVzYyhmaWxlLCBwYXRoLCAuLi5wYXRocykge1xuICAgIHJldHVybiBwYXRocy5yZWR1Y2UoKGFjYywgY3VyKSA9PiBhY2MubmVzdGVkTWVzc2FnZXNbY3VyXSwgZmlsZS5tZXNzYWdlc1twYXRoXSk7XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbi8qKlxuICogSHlkcmF0ZSBhbiBlbnVtIGRlc2NyaXB0b3IuXG4gKlxuICogQHByaXZhdGVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVudW1EZXNjKGZpbGUsIHBhdGgsIC4uLnBhdGhzKSB7XG4gICAgaWYgKHBhdGhzLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIHJldHVybiBmaWxlLmVudW1zW3BhdGhdO1xuICAgIH1cbiAgICBjb25zdCBlID0gcGF0aHMucG9wKCk7IC8vIHdlIGNoZWNrZWQgbGVuZ3RoIGFib3ZlXG4gICAgcmV0dXJuIHBhdGhzLnJlZHVjZSgoYWNjLCBjdXIpID0+IGFjYy5uZXN0ZWRNZXNzYWdlc1tjdXJdLCBmaWxlLm1lc3NhZ2VzW3BhdGhdKS5uZXN0ZWRFbnVtc1tlXTtcbn1cbi8qKlxuICogQ29uc3RydWN0IGEgVHlwZVNjcmlwdCBlbnVtIG9iamVjdCBhdCBydW50aW1lIGZyb20gYSBkZXNjcmlwdG9yLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdHNFbnVtKGRlc2MpIHtcbiAgICBjb25zdCBlbnVtT2JqZWN0ID0ge307XG4gICAgZm9yIChjb25zdCB2YWx1ZSBvZiBkZXNjLnZhbHVlcykge1xuICAgICAgICBlbnVtT2JqZWN0W3ZhbHVlLmxvY2FsTmFtZV0gPSB2YWx1ZS5udW1iZXI7XG4gICAgICAgIGVudW1PYmplY3RbdmFsdWUubnVtYmVyXSA9IHZhbHVlLmxvY2FsTmFtZTtcbiAgICB9XG4gICAgcmV0dXJuIGVudW1PYmplY3Q7XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbmltcG9ydCB7IGJvb3QgfSBmcm9tIFwiLi4vLi4vLi4vLi4vY29kZWdlbnYyL2Jvb3QuanNcIjtcbmltcG9ydCB7IG1lc3NhZ2VEZXNjIH0gZnJvbSBcIi4uLy4uLy4uLy4uL2NvZGVnZW52Mi9tZXNzYWdlLmpzXCI7XG5pbXBvcnQgeyBlbnVtRGVzYyB9IGZyb20gXCIuLi8uLi8uLi8uLi9jb2RlZ2VudjIvZW51bS5qc1wiO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIGZpbGUgZ29vZ2xlL3Byb3RvYnVmL2Rlc2NyaXB0b3IucHJvdG8uXG4gKi9cbmV4cG9ydCBjb25zdCBmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yID0gLypAX19QVVJFX18qLyBib290KHsgXCJuYW1lXCI6IFwiZ29vZ2xlL3Byb3RvYnVmL2Rlc2NyaXB0b3IucHJvdG9cIiwgXCJwYWNrYWdlXCI6IFwiZ29vZ2xlLnByb3RvYnVmXCIsIFwibWVzc2FnZVR5cGVcIjogW3sgXCJuYW1lXCI6IFwiRmlsZURlc2NyaXB0b3JTZXRcIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJmaWxlXCIsIFwibnVtYmVyXCI6IDEsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAzLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5GaWxlRGVzY3JpcHRvclByb3RvXCIgfV0sIFwiZXh0ZW5zaW9uUmFuZ2VcIjogW3sgXCJzdGFydFwiOiA1MzYwMDAwMDAsIFwiZW5kXCI6IDUzNjAwMDAwMSB9XSB9LCB7IFwibmFtZVwiOiBcIkZpbGVEZXNjcmlwdG9yUHJvdG9cIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJuYW1lXCIsIFwibnVtYmVyXCI6IDEsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJwYWNrYWdlXCIsIFwibnVtYmVyXCI6IDIsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJkZXBlbmRlbmN5XCIsIFwibnVtYmVyXCI6IDMsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDMgfSwgeyBcIm5hbWVcIjogXCJwdWJsaWNfZGVwZW5kZW5jeVwiLCBcIm51bWJlclwiOiAxMCwgXCJ0eXBlXCI6IDUsIFwibGFiZWxcIjogMyB9LCB7IFwibmFtZVwiOiBcIndlYWtfZGVwZW5kZW5jeVwiLCBcIm51bWJlclwiOiAxMSwgXCJ0eXBlXCI6IDUsIFwibGFiZWxcIjogMyB9LCB7IFwibmFtZVwiOiBcIm9wdGlvbl9kZXBlbmRlbmN5XCIsIFwibnVtYmVyXCI6IDE1LCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAzIH0sIHsgXCJuYW1lXCI6IFwibWVzc2FnZV90eXBlXCIsIFwibnVtYmVyXCI6IDQsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAzLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5EZXNjcmlwdG9yUHJvdG9cIiB9LCB7IFwibmFtZVwiOiBcImVudW1fdHlwZVwiLCBcIm51bWJlclwiOiA1LCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMywgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRW51bURlc2NyaXB0b3JQcm90b1wiIH0sIHsgXCJuYW1lXCI6IFwic2VydmljZVwiLCBcIm51bWJlclwiOiA2LCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMywgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuU2VydmljZURlc2NyaXB0b3JQcm90b1wiIH0sIHsgXCJuYW1lXCI6IFwiZXh0ZW5zaW9uXCIsIFwibnVtYmVyXCI6IDcsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAzLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5GaWVsZERlc2NyaXB0b3JQcm90b1wiIH0sIHsgXCJuYW1lXCI6IFwib3B0aW9uc1wiLCBcIm51bWJlclwiOiA4LCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmlsZU9wdGlvbnNcIiB9LCB7IFwibmFtZVwiOiBcInNvdXJjZV9jb2RlX2luZm9cIiwgXCJudW1iZXJcIjogOSwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLlNvdXJjZUNvZGVJbmZvXCIgfSwgeyBcIm5hbWVcIjogXCJzeW50YXhcIiwgXCJudW1iZXJcIjogMTIsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJlZGl0aW9uXCIsIFwibnVtYmVyXCI6IDE0LCBcInR5cGVcIjogMTQsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRWRpdGlvblwiIH1dIH0sIHsgXCJuYW1lXCI6IFwiRGVzY3JpcHRvclByb3RvXCIsIFwiZmllbGRcIjogW3sgXCJuYW1lXCI6IFwibmFtZVwiLCBcIm51bWJlclwiOiAxLCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiZmllbGRcIiwgXCJudW1iZXJcIjogMiwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDMsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZpZWxkRGVzY3JpcHRvclByb3RvXCIgfSwgeyBcIm5hbWVcIjogXCJleHRlbnNpb25cIiwgXCJudW1iZXJcIjogNiwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDMsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZpZWxkRGVzY3JpcHRvclByb3RvXCIgfSwgeyBcIm5hbWVcIjogXCJuZXN0ZWRfdHlwZVwiLCBcIm51bWJlclwiOiAzLCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMywgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRGVzY3JpcHRvclByb3RvXCIgfSwgeyBcIm5hbWVcIjogXCJlbnVtX3R5cGVcIiwgXCJudW1iZXJcIjogNCwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDMsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkVudW1EZXNjcmlwdG9yUHJvdG9cIiB9LCB7IFwibmFtZVwiOiBcImV4dGVuc2lvbl9yYW5nZVwiLCBcIm51bWJlclwiOiA1LCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMywgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRGVzY3JpcHRvclByb3RvLkV4dGVuc2lvblJhbmdlXCIgfSwgeyBcIm5hbWVcIjogXCJvbmVvZl9kZWNsXCIsIFwibnVtYmVyXCI6IDgsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAzLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5PbmVvZkRlc2NyaXB0b3JQcm90b1wiIH0sIHsgXCJuYW1lXCI6IFwib3B0aW9uc1wiLCBcIm51bWJlclwiOiA3LCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuTWVzc2FnZU9wdGlvbnNcIiB9LCB7IFwibmFtZVwiOiBcInJlc2VydmVkX3JhbmdlXCIsIFwibnVtYmVyXCI6IDksIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAzLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5EZXNjcmlwdG9yUHJvdG8uUmVzZXJ2ZWRSYW5nZVwiIH0sIHsgXCJuYW1lXCI6IFwicmVzZXJ2ZWRfbmFtZVwiLCBcIm51bWJlclwiOiAxMCwgXCJ0eXBlXCI6IDksIFwibGFiZWxcIjogMyB9LCB7IFwibmFtZVwiOiBcInZpc2liaWxpdHlcIiwgXCJudW1iZXJcIjogMTEsIFwidHlwZVwiOiAxNCwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5TeW1ib2xWaXNpYmlsaXR5XCIgfV0sIFwibmVzdGVkVHlwZVwiOiBbeyBcIm5hbWVcIjogXCJFeHRlbnNpb25SYW5nZVwiLCBcImZpZWxkXCI6IFt7IFwibmFtZVwiOiBcInN0YXJ0XCIsIFwibnVtYmVyXCI6IDEsIFwidHlwZVwiOiA1LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJlbmRcIiwgXCJudW1iZXJcIjogMiwgXCJ0eXBlXCI6IDUsIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcIm9wdGlvbnNcIiwgXCJudW1iZXJcIjogMywgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkV4dGVuc2lvblJhbmdlT3B0aW9uc1wiIH1dIH0sIHsgXCJuYW1lXCI6IFwiUmVzZXJ2ZWRSYW5nZVwiLCBcImZpZWxkXCI6IFt7IFwibmFtZVwiOiBcInN0YXJ0XCIsIFwibnVtYmVyXCI6IDEsIFwidHlwZVwiOiA1LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJlbmRcIiwgXCJudW1iZXJcIjogMiwgXCJ0eXBlXCI6IDUsIFwibGFiZWxcIjogMSB9XSB9XSB9LCB7IFwibmFtZVwiOiBcIkV4dGVuc2lvblJhbmdlT3B0aW9uc1wiLCBcImZpZWxkXCI6IFt7IFwibmFtZVwiOiBcInVuaW50ZXJwcmV0ZWRfb3B0aW9uXCIsIFwibnVtYmVyXCI6IDk5OSwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDMsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLlVuaW50ZXJwcmV0ZWRPcHRpb25cIiB9LCB7IFwibmFtZVwiOiBcImRlY2xhcmF0aW9uXCIsIFwibnVtYmVyXCI6IDIsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAzLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5FeHRlbnNpb25SYW5nZU9wdGlvbnMuRGVjbGFyYXRpb25cIiwgXCJvcHRpb25zXCI6IHsgXCJyZXRlbnRpb25cIjogMiB9IH0sIHsgXCJuYW1lXCI6IFwiZmVhdHVyZXNcIiwgXCJudW1iZXJcIjogNTAsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0XCIgfSwgeyBcIm5hbWVcIjogXCJ2ZXJpZmljYXRpb25cIiwgXCJudW1iZXJcIjogMywgXCJ0eXBlXCI6IDE0LCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkV4dGVuc2lvblJhbmdlT3B0aW9ucy5WZXJpZmljYXRpb25TdGF0ZVwiLCBcImRlZmF1bHRWYWx1ZVwiOiBcIlVOVkVSSUZJRURcIiwgXCJvcHRpb25zXCI6IHsgXCJyZXRlbnRpb25cIjogMiB9IH1dLCBcIm5lc3RlZFR5cGVcIjogW3sgXCJuYW1lXCI6IFwiRGVjbGFyYXRpb25cIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJudW1iZXJcIiwgXCJudW1iZXJcIjogMSwgXCJ0eXBlXCI6IDUsIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcImZ1bGxfbmFtZVwiLCBcIm51bWJlclwiOiAyLCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwidHlwZVwiLCBcIm51bWJlclwiOiAzLCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwicmVzZXJ2ZWRcIiwgXCJudW1iZXJcIjogNSwgXCJ0eXBlXCI6IDgsIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcInJlcGVhdGVkXCIsIFwibnVtYmVyXCI6IDYsIFwidHlwZVwiOiA4LCBcImxhYmVsXCI6IDEgfV0gfV0sIFwiZW51bVR5cGVcIjogW3sgXCJuYW1lXCI6IFwiVmVyaWZpY2F0aW9uU3RhdGVcIiwgXCJ2YWx1ZVwiOiBbeyBcIm5hbWVcIjogXCJERUNMQVJBVElPTlwiLCBcIm51bWJlclwiOiAwIH0sIHsgXCJuYW1lXCI6IFwiVU5WRVJJRklFRFwiLCBcIm51bWJlclwiOiAxIH1dIH1dLCBcImV4dGVuc2lvblJhbmdlXCI6IFt7IFwic3RhcnRcIjogMTAwMCwgXCJlbmRcIjogNTM2ODcwOTEyIH1dIH0sIHsgXCJuYW1lXCI6IFwiRmllbGREZXNjcmlwdG9yUHJvdG9cIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJuYW1lXCIsIFwibnVtYmVyXCI6IDEsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJudW1iZXJcIiwgXCJudW1iZXJcIjogMywgXCJ0eXBlXCI6IDUsIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcImxhYmVsXCIsIFwibnVtYmVyXCI6IDQsIFwidHlwZVwiOiAxNCwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5GaWVsZERlc2NyaXB0b3JQcm90by5MYWJlbFwiIH0sIHsgXCJuYW1lXCI6IFwidHlwZVwiLCBcIm51bWJlclwiOiA1LCBcInR5cGVcIjogMTQsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmllbGREZXNjcmlwdG9yUHJvdG8uVHlwZVwiIH0sIHsgXCJuYW1lXCI6IFwidHlwZV9uYW1lXCIsIFwibnVtYmVyXCI6IDYsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJleHRlbmRlZVwiLCBcIm51bWJlclwiOiAyLCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiZGVmYXVsdF92YWx1ZVwiLCBcIm51bWJlclwiOiA3LCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwib25lb2ZfaW5kZXhcIiwgXCJudW1iZXJcIjogOSwgXCJ0eXBlXCI6IDUsIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcImpzb25fbmFtZVwiLCBcIm51bWJlclwiOiAxMCwgXCJ0eXBlXCI6IDksIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcIm9wdGlvbnNcIiwgXCJudW1iZXJcIjogOCwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZpZWxkT3B0aW9uc1wiIH0sIHsgXCJuYW1lXCI6IFwicHJvdG8zX29wdGlvbmFsXCIsIFwibnVtYmVyXCI6IDE3LCBcInR5cGVcIjogOCwgXCJsYWJlbFwiOiAxIH1dLCBcImVudW1UeXBlXCI6IFt7IFwibmFtZVwiOiBcIlR5cGVcIiwgXCJ2YWx1ZVwiOiBbeyBcIm5hbWVcIjogXCJUWVBFX0RPVUJMRVwiLCBcIm51bWJlclwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiVFlQRV9GTE9BVFwiLCBcIm51bWJlclwiOiAyIH0sIHsgXCJuYW1lXCI6IFwiVFlQRV9JTlQ2NFwiLCBcIm51bWJlclwiOiAzIH0sIHsgXCJuYW1lXCI6IFwiVFlQRV9VSU5UNjRcIiwgXCJudW1iZXJcIjogNCB9LCB7IFwibmFtZVwiOiBcIlRZUEVfSU5UMzJcIiwgXCJudW1iZXJcIjogNSB9LCB7IFwibmFtZVwiOiBcIlRZUEVfRklYRUQ2NFwiLCBcIm51bWJlclwiOiA2IH0sIHsgXCJuYW1lXCI6IFwiVFlQRV9GSVhFRDMyXCIsIFwibnVtYmVyXCI6IDcgfSwgeyBcIm5hbWVcIjogXCJUWVBFX0JPT0xcIiwgXCJudW1iZXJcIjogOCB9LCB7IFwibmFtZVwiOiBcIlRZUEVfU1RSSU5HXCIsIFwibnVtYmVyXCI6IDkgfSwgeyBcIm5hbWVcIjogXCJUWVBFX0dST1VQXCIsIFwibnVtYmVyXCI6IDEwIH0sIHsgXCJuYW1lXCI6IFwiVFlQRV9NRVNTQUdFXCIsIFwibnVtYmVyXCI6IDExIH0sIHsgXCJuYW1lXCI6IFwiVFlQRV9CWVRFU1wiLCBcIm51bWJlclwiOiAxMiB9LCB7IFwibmFtZVwiOiBcIlRZUEVfVUlOVDMyXCIsIFwibnVtYmVyXCI6IDEzIH0sIHsgXCJuYW1lXCI6IFwiVFlQRV9FTlVNXCIsIFwibnVtYmVyXCI6IDE0IH0sIHsgXCJuYW1lXCI6IFwiVFlQRV9TRklYRUQzMlwiLCBcIm51bWJlclwiOiAxNSB9LCB7IFwibmFtZVwiOiBcIlRZUEVfU0ZJWEVENjRcIiwgXCJudW1iZXJcIjogMTYgfSwgeyBcIm5hbWVcIjogXCJUWVBFX1NJTlQzMlwiLCBcIm51bWJlclwiOiAxNyB9LCB7IFwibmFtZVwiOiBcIlRZUEVfU0lOVDY0XCIsIFwibnVtYmVyXCI6IDE4IH1dIH0sIHsgXCJuYW1lXCI6IFwiTGFiZWxcIiwgXCJ2YWx1ZVwiOiBbeyBcIm5hbWVcIjogXCJMQUJFTF9PUFRJT05BTFwiLCBcIm51bWJlclwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiTEFCRUxfUkVQRUFURURcIiwgXCJudW1iZXJcIjogMyB9LCB7IFwibmFtZVwiOiBcIkxBQkVMX1JFUVVJUkVEXCIsIFwibnVtYmVyXCI6IDIgfV0gfV0gfSwgeyBcIm5hbWVcIjogXCJPbmVvZkRlc2NyaXB0b3JQcm90b1wiLCBcImZpZWxkXCI6IFt7IFwibmFtZVwiOiBcIm5hbWVcIiwgXCJudW1iZXJcIjogMSwgXCJ0eXBlXCI6IDksIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcIm9wdGlvbnNcIiwgXCJudW1iZXJcIjogMiwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLk9uZW9mT3B0aW9uc1wiIH1dIH0sIHsgXCJuYW1lXCI6IFwiRW51bURlc2NyaXB0b3JQcm90b1wiLCBcImZpZWxkXCI6IFt7IFwibmFtZVwiOiBcIm5hbWVcIiwgXCJudW1iZXJcIjogMSwgXCJ0eXBlXCI6IDksIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcInZhbHVlXCIsIFwibnVtYmVyXCI6IDIsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAzLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5FbnVtVmFsdWVEZXNjcmlwdG9yUHJvdG9cIiB9LCB7IFwibmFtZVwiOiBcIm9wdGlvbnNcIiwgXCJudW1iZXJcIjogMywgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkVudW1PcHRpb25zXCIgfSwgeyBcIm5hbWVcIjogXCJyZXNlcnZlZF9yYW5nZVwiLCBcIm51bWJlclwiOiA0LCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMywgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRW51bURlc2NyaXB0b3JQcm90by5FbnVtUmVzZXJ2ZWRSYW5nZVwiIH0sIHsgXCJuYW1lXCI6IFwicmVzZXJ2ZWRfbmFtZVwiLCBcIm51bWJlclwiOiA1LCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAzIH0sIHsgXCJuYW1lXCI6IFwidmlzaWJpbGl0eVwiLCBcIm51bWJlclwiOiA2LCBcInR5cGVcIjogMTQsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuU3ltYm9sVmlzaWJpbGl0eVwiIH1dLCBcIm5lc3RlZFR5cGVcIjogW3sgXCJuYW1lXCI6IFwiRW51bVJlc2VydmVkUmFuZ2VcIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJzdGFydFwiLCBcIm51bWJlclwiOiAxLCBcInR5cGVcIjogNSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiZW5kXCIsIFwibnVtYmVyXCI6IDIsIFwidHlwZVwiOiA1LCBcImxhYmVsXCI6IDEgfV0gfV0gfSwgeyBcIm5hbWVcIjogXCJFbnVtVmFsdWVEZXNjcmlwdG9yUHJvdG9cIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJuYW1lXCIsIFwibnVtYmVyXCI6IDEsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJudW1iZXJcIiwgXCJudW1iZXJcIjogMiwgXCJ0eXBlXCI6IDUsIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcIm9wdGlvbnNcIiwgXCJudW1iZXJcIjogMywgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkVudW1WYWx1ZU9wdGlvbnNcIiB9XSB9LCB7IFwibmFtZVwiOiBcIlNlcnZpY2VEZXNjcmlwdG9yUHJvdG9cIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJuYW1lXCIsIFwibnVtYmVyXCI6IDEsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJtZXRob2RcIiwgXCJudW1iZXJcIjogMiwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDMsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLk1ldGhvZERlc2NyaXB0b3JQcm90b1wiIH0sIHsgXCJuYW1lXCI6IFwib3B0aW9uc1wiLCBcIm51bWJlclwiOiAzLCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuU2VydmljZU9wdGlvbnNcIiB9XSB9LCB7IFwibmFtZVwiOiBcIk1ldGhvZERlc2NyaXB0b3JQcm90b1wiLCBcImZpZWxkXCI6IFt7IFwibmFtZVwiOiBcIm5hbWVcIiwgXCJudW1iZXJcIjogMSwgXCJ0eXBlXCI6IDksIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcImlucHV0X3R5cGVcIiwgXCJudW1iZXJcIjogMiwgXCJ0eXBlXCI6IDksIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcIm91dHB1dF90eXBlXCIsIFwibnVtYmVyXCI6IDMsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJvcHRpb25zXCIsIFwibnVtYmVyXCI6IDQsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5NZXRob2RPcHRpb25zXCIgfSwgeyBcIm5hbWVcIjogXCJjbGllbnRfc3RyZWFtaW5nXCIsIFwibnVtYmVyXCI6IDUsIFwidHlwZVwiOiA4LCBcImxhYmVsXCI6IDEsIFwiZGVmYXVsdFZhbHVlXCI6IFwiZmFsc2VcIiB9LCB7IFwibmFtZVwiOiBcInNlcnZlcl9zdHJlYW1pbmdcIiwgXCJudW1iZXJcIjogNiwgXCJ0eXBlXCI6IDgsIFwibGFiZWxcIjogMSwgXCJkZWZhdWx0VmFsdWVcIjogXCJmYWxzZVwiIH1dIH0sIHsgXCJuYW1lXCI6IFwiRmlsZU9wdGlvbnNcIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJqYXZhX3BhY2thZ2VcIiwgXCJudW1iZXJcIjogMSwgXCJ0eXBlXCI6IDksIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcImphdmFfb3V0ZXJfY2xhc3NuYW1lXCIsIFwibnVtYmVyXCI6IDgsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJqYXZhX211bHRpcGxlX2ZpbGVzXCIsIFwibnVtYmVyXCI6IDEwLCBcInR5cGVcIjogOCwgXCJsYWJlbFwiOiAxLCBcImRlZmF1bHRWYWx1ZVwiOiBcImZhbHNlXCIgfSwgeyBcIm5hbWVcIjogXCJqYXZhX2dlbmVyYXRlX2VxdWFsc19hbmRfaGFzaFwiLCBcIm51bWJlclwiOiAyMCwgXCJ0eXBlXCI6IDgsIFwibGFiZWxcIjogMSwgXCJvcHRpb25zXCI6IHsgXCJkZXByZWNhdGVkXCI6IHRydWUgfSB9LCB7IFwibmFtZVwiOiBcImphdmFfc3RyaW5nX2NoZWNrX3V0ZjhcIiwgXCJudW1iZXJcIjogMjcsIFwidHlwZVwiOiA4LCBcImxhYmVsXCI6IDEsIFwiZGVmYXVsdFZhbHVlXCI6IFwiZmFsc2VcIiB9LCB7IFwibmFtZVwiOiBcIm9wdGltaXplX2ZvclwiLCBcIm51bWJlclwiOiA5LCBcInR5cGVcIjogMTQsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmlsZU9wdGlvbnMuT3B0aW1pemVNb2RlXCIsIFwiZGVmYXVsdFZhbHVlXCI6IFwiU1BFRURcIiB9LCB7IFwibmFtZVwiOiBcImdvX3BhY2thZ2VcIiwgXCJudW1iZXJcIjogMTEsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJjY19nZW5lcmljX3NlcnZpY2VzXCIsIFwibnVtYmVyXCI6IDE2LCBcInR5cGVcIjogOCwgXCJsYWJlbFwiOiAxLCBcImRlZmF1bHRWYWx1ZVwiOiBcImZhbHNlXCIgfSwgeyBcIm5hbWVcIjogXCJqYXZhX2dlbmVyaWNfc2VydmljZXNcIiwgXCJudW1iZXJcIjogMTcsIFwidHlwZVwiOiA4LCBcImxhYmVsXCI6IDEsIFwiZGVmYXVsdFZhbHVlXCI6IFwiZmFsc2VcIiB9LCB7IFwibmFtZVwiOiBcInB5X2dlbmVyaWNfc2VydmljZXNcIiwgXCJudW1iZXJcIjogMTgsIFwidHlwZVwiOiA4LCBcImxhYmVsXCI6IDEsIFwiZGVmYXVsdFZhbHVlXCI6IFwiZmFsc2VcIiB9LCB7IFwibmFtZVwiOiBcImRlcHJlY2F0ZWRcIiwgXCJudW1iZXJcIjogMjMsIFwidHlwZVwiOiA4LCBcImxhYmVsXCI6IDEsIFwiZGVmYXVsdFZhbHVlXCI6IFwiZmFsc2VcIiB9LCB7IFwibmFtZVwiOiBcImNjX2VuYWJsZV9hcmVuYXNcIiwgXCJudW1iZXJcIjogMzEsIFwidHlwZVwiOiA4LCBcImxhYmVsXCI6IDEsIFwiZGVmYXVsdFZhbHVlXCI6IFwidHJ1ZVwiIH0sIHsgXCJuYW1lXCI6IFwib2JqY19jbGFzc19wcmVmaXhcIiwgXCJudW1iZXJcIjogMzYsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJjc2hhcnBfbmFtZXNwYWNlXCIsIFwibnVtYmVyXCI6IDM3LCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwic3dpZnRfcHJlZml4XCIsIFwibnVtYmVyXCI6IDM5LCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwicGhwX2NsYXNzX3ByZWZpeFwiLCBcIm51bWJlclwiOiA0MCwgXCJ0eXBlXCI6IDksIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcInBocF9uYW1lc3BhY2VcIiwgXCJudW1iZXJcIjogNDEsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJwaHBfbWV0YWRhdGFfbmFtZXNwYWNlXCIsIFwibnVtYmVyXCI6IDQ0LCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwicnVieV9wYWNrYWdlXCIsIFwibnVtYmVyXCI6IDQ1LCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiZmVhdHVyZXNcIiwgXCJudW1iZXJcIjogNTAsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0XCIgfSwgeyBcIm5hbWVcIjogXCJ1bmludGVycHJldGVkX29wdGlvblwiLCBcIm51bWJlclwiOiA5OTksIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAzLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5VbmludGVycHJldGVkT3B0aW9uXCIgfV0sIFwiZW51bVR5cGVcIjogW3sgXCJuYW1lXCI6IFwiT3B0aW1pemVNb2RlXCIsIFwidmFsdWVcIjogW3sgXCJuYW1lXCI6IFwiU1BFRURcIiwgXCJudW1iZXJcIjogMSB9LCB7IFwibmFtZVwiOiBcIkNPREVfU0laRVwiLCBcIm51bWJlclwiOiAyIH0sIHsgXCJuYW1lXCI6IFwiTElURV9SVU5USU1FXCIsIFwibnVtYmVyXCI6IDMgfV0gfV0sIFwiZXh0ZW5zaW9uUmFuZ2VcIjogW3sgXCJzdGFydFwiOiAxMDAwLCBcImVuZFwiOiA1MzY4NzA5MTIgfV0gfSwgeyBcIm5hbWVcIjogXCJNZXNzYWdlT3B0aW9uc1wiLCBcImZpZWxkXCI6IFt7IFwibmFtZVwiOiBcIm1lc3NhZ2Vfc2V0X3dpcmVfZm9ybWF0XCIsIFwibnVtYmVyXCI6IDEsIFwidHlwZVwiOiA4LCBcImxhYmVsXCI6IDEsIFwiZGVmYXVsdFZhbHVlXCI6IFwiZmFsc2VcIiB9LCB7IFwibmFtZVwiOiBcIm5vX3N0YW5kYXJkX2Rlc2NyaXB0b3JfYWNjZXNzb3JcIiwgXCJudW1iZXJcIjogMiwgXCJ0eXBlXCI6IDgsIFwibGFiZWxcIjogMSwgXCJkZWZhdWx0VmFsdWVcIjogXCJmYWxzZVwiIH0sIHsgXCJuYW1lXCI6IFwiZGVwcmVjYXRlZFwiLCBcIm51bWJlclwiOiAzLCBcInR5cGVcIjogOCwgXCJsYWJlbFwiOiAxLCBcImRlZmF1bHRWYWx1ZVwiOiBcImZhbHNlXCIgfSwgeyBcIm5hbWVcIjogXCJtYXBfZW50cnlcIiwgXCJudW1iZXJcIjogNywgXCJ0eXBlXCI6IDgsIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcImRlcHJlY2F0ZWRfbGVnYWN5X2pzb25fZmllbGRfY29uZmxpY3RzXCIsIFwibnVtYmVyXCI6IDExLCBcInR5cGVcIjogOCwgXCJsYWJlbFwiOiAxLCBcIm9wdGlvbnNcIjogeyBcImRlcHJlY2F0ZWRcIjogdHJ1ZSB9IH0sIHsgXCJuYW1lXCI6IFwiZmVhdHVyZXNcIiwgXCJudW1iZXJcIjogMTIsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0XCIgfSwgeyBcIm5hbWVcIjogXCJ1bmludGVycHJldGVkX29wdGlvblwiLCBcIm51bWJlclwiOiA5OTksIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAzLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5VbmludGVycHJldGVkT3B0aW9uXCIgfV0sIFwiZXh0ZW5zaW9uUmFuZ2VcIjogW3sgXCJzdGFydFwiOiAxMDAwLCBcImVuZFwiOiA1MzY4NzA5MTIgfV0gfSwgeyBcIm5hbWVcIjogXCJGaWVsZE9wdGlvbnNcIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJjdHlwZVwiLCBcIm51bWJlclwiOiAxLCBcInR5cGVcIjogMTQsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmllbGRPcHRpb25zLkNUeXBlXCIsIFwiZGVmYXVsdFZhbHVlXCI6IFwiU1RSSU5HXCIgfSwgeyBcIm5hbWVcIjogXCJwYWNrZWRcIiwgXCJudW1iZXJcIjogMiwgXCJ0eXBlXCI6IDgsIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcImpzdHlwZVwiLCBcIm51bWJlclwiOiA2LCBcInR5cGVcIjogMTQsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmllbGRPcHRpb25zLkpTVHlwZVwiLCBcImRlZmF1bHRWYWx1ZVwiOiBcIkpTX05PUk1BTFwiIH0sIHsgXCJuYW1lXCI6IFwibGF6eVwiLCBcIm51bWJlclwiOiA1LCBcInR5cGVcIjogOCwgXCJsYWJlbFwiOiAxLCBcImRlZmF1bHRWYWx1ZVwiOiBcImZhbHNlXCIgfSwgeyBcIm5hbWVcIjogXCJ1bnZlcmlmaWVkX2xhenlcIiwgXCJudW1iZXJcIjogMTUsIFwidHlwZVwiOiA4LCBcImxhYmVsXCI6IDEsIFwiZGVmYXVsdFZhbHVlXCI6IFwiZmFsc2VcIiB9LCB7IFwibmFtZVwiOiBcImRlcHJlY2F0ZWRcIiwgXCJudW1iZXJcIjogMywgXCJ0eXBlXCI6IDgsIFwibGFiZWxcIjogMSwgXCJkZWZhdWx0VmFsdWVcIjogXCJmYWxzZVwiIH0sIHsgXCJuYW1lXCI6IFwid2Vha1wiLCBcIm51bWJlclwiOiAxMCwgXCJ0eXBlXCI6IDgsIFwibGFiZWxcIjogMSwgXCJkZWZhdWx0VmFsdWVcIjogXCJmYWxzZVwiLCBcIm9wdGlvbnNcIjogeyBcImRlcHJlY2F0ZWRcIjogdHJ1ZSB9IH0sIHsgXCJuYW1lXCI6IFwiZGVidWdfcmVkYWN0XCIsIFwibnVtYmVyXCI6IDE2LCBcInR5cGVcIjogOCwgXCJsYWJlbFwiOiAxLCBcImRlZmF1bHRWYWx1ZVwiOiBcImZhbHNlXCIgfSwgeyBcIm5hbWVcIjogXCJyZXRlbnRpb25cIiwgXCJudW1iZXJcIjogMTcsIFwidHlwZVwiOiAxNCwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5GaWVsZE9wdGlvbnMuT3B0aW9uUmV0ZW50aW9uXCIgfSwgeyBcIm5hbWVcIjogXCJ0YXJnZXRzXCIsIFwibnVtYmVyXCI6IDE5LCBcInR5cGVcIjogMTQsIFwibGFiZWxcIjogMywgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmllbGRPcHRpb25zLk9wdGlvblRhcmdldFR5cGVcIiB9LCB7IFwibmFtZVwiOiBcImVkaXRpb25fZGVmYXVsdHNcIiwgXCJudW1iZXJcIjogMjAsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAzLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5GaWVsZE9wdGlvbnMuRWRpdGlvbkRlZmF1bHRcIiB9LCB7IFwibmFtZVwiOiBcImZlYXR1cmVzXCIsIFwibnVtYmVyXCI6IDIxLCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmVhdHVyZVNldFwiIH0sIHsgXCJuYW1lXCI6IFwiZmVhdHVyZV9zdXBwb3J0XCIsIFwibnVtYmVyXCI6IDIyLCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmllbGRPcHRpb25zLkZlYXR1cmVTdXBwb3J0XCIgfSwgeyBcIm5hbWVcIjogXCJ1bmludGVycHJldGVkX29wdGlvblwiLCBcIm51bWJlclwiOiA5OTksIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAzLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5VbmludGVycHJldGVkT3B0aW9uXCIgfV0sIFwibmVzdGVkVHlwZVwiOiBbeyBcIm5hbWVcIjogXCJFZGl0aW9uRGVmYXVsdFwiLCBcImZpZWxkXCI6IFt7IFwibmFtZVwiOiBcImVkaXRpb25cIiwgXCJudW1iZXJcIjogMywgXCJ0eXBlXCI6IDE0LCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkVkaXRpb25cIiB9LCB7IFwibmFtZVwiOiBcInZhbHVlXCIsIFwibnVtYmVyXCI6IDIsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfV0gfSwgeyBcIm5hbWVcIjogXCJGZWF0dXJlU3VwcG9ydFwiLCBcImZpZWxkXCI6IFt7IFwibmFtZVwiOiBcImVkaXRpb25faW50cm9kdWNlZFwiLCBcIm51bWJlclwiOiAxLCBcInR5cGVcIjogMTQsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRWRpdGlvblwiIH0sIHsgXCJuYW1lXCI6IFwiZWRpdGlvbl9kZXByZWNhdGVkXCIsIFwibnVtYmVyXCI6IDIsIFwidHlwZVwiOiAxNCwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5FZGl0aW9uXCIgfSwgeyBcIm5hbWVcIjogXCJkZXByZWNhdGlvbl93YXJuaW5nXCIsIFwibnVtYmVyXCI6IDMsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJlZGl0aW9uX3JlbW92ZWRcIiwgXCJudW1iZXJcIjogNCwgXCJ0eXBlXCI6IDE0LCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkVkaXRpb25cIiB9XSB9XSwgXCJlbnVtVHlwZVwiOiBbeyBcIm5hbWVcIjogXCJDVHlwZVwiLCBcInZhbHVlXCI6IFt7IFwibmFtZVwiOiBcIlNUUklOR1wiLCBcIm51bWJlclwiOiAwIH0sIHsgXCJuYW1lXCI6IFwiQ09SRFwiLCBcIm51bWJlclwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiU1RSSU5HX1BJRUNFXCIsIFwibnVtYmVyXCI6IDIgfV0gfSwgeyBcIm5hbWVcIjogXCJKU1R5cGVcIiwgXCJ2YWx1ZVwiOiBbeyBcIm5hbWVcIjogXCJKU19OT1JNQUxcIiwgXCJudW1iZXJcIjogMCB9LCB7IFwibmFtZVwiOiBcIkpTX1NUUklOR1wiLCBcIm51bWJlclwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiSlNfTlVNQkVSXCIsIFwibnVtYmVyXCI6IDIgfV0gfSwgeyBcIm5hbWVcIjogXCJPcHRpb25SZXRlbnRpb25cIiwgXCJ2YWx1ZVwiOiBbeyBcIm5hbWVcIjogXCJSRVRFTlRJT05fVU5LTk9XTlwiLCBcIm51bWJlclwiOiAwIH0sIHsgXCJuYW1lXCI6IFwiUkVURU5USU9OX1JVTlRJTUVcIiwgXCJudW1iZXJcIjogMSB9LCB7IFwibmFtZVwiOiBcIlJFVEVOVElPTl9TT1VSQ0VcIiwgXCJudW1iZXJcIjogMiB9XSB9LCB7IFwibmFtZVwiOiBcIk9wdGlvblRhcmdldFR5cGVcIiwgXCJ2YWx1ZVwiOiBbeyBcIm5hbWVcIjogXCJUQVJHRVRfVFlQRV9VTktOT1dOXCIsIFwibnVtYmVyXCI6IDAgfSwgeyBcIm5hbWVcIjogXCJUQVJHRVRfVFlQRV9GSUxFXCIsIFwibnVtYmVyXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJUQVJHRVRfVFlQRV9FWFRFTlNJT05fUkFOR0VcIiwgXCJudW1iZXJcIjogMiB9LCB7IFwibmFtZVwiOiBcIlRBUkdFVF9UWVBFX01FU1NBR0VcIiwgXCJudW1iZXJcIjogMyB9LCB7IFwibmFtZVwiOiBcIlRBUkdFVF9UWVBFX0ZJRUxEXCIsIFwibnVtYmVyXCI6IDQgfSwgeyBcIm5hbWVcIjogXCJUQVJHRVRfVFlQRV9PTkVPRlwiLCBcIm51bWJlclwiOiA1IH0sIHsgXCJuYW1lXCI6IFwiVEFSR0VUX1RZUEVfRU5VTVwiLCBcIm51bWJlclwiOiA2IH0sIHsgXCJuYW1lXCI6IFwiVEFSR0VUX1RZUEVfRU5VTV9FTlRSWVwiLCBcIm51bWJlclwiOiA3IH0sIHsgXCJuYW1lXCI6IFwiVEFSR0VUX1RZUEVfU0VSVklDRVwiLCBcIm51bWJlclwiOiA4IH0sIHsgXCJuYW1lXCI6IFwiVEFSR0VUX1RZUEVfTUVUSE9EXCIsIFwibnVtYmVyXCI6IDkgfV0gfV0sIFwiZXh0ZW5zaW9uUmFuZ2VcIjogW3sgXCJzdGFydFwiOiAxMDAwLCBcImVuZFwiOiA1MzY4NzA5MTIgfV0gfSwgeyBcIm5hbWVcIjogXCJPbmVvZk9wdGlvbnNcIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJmZWF0dXJlc1wiLCBcIm51bWJlclwiOiAxLCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmVhdHVyZVNldFwiIH0sIHsgXCJuYW1lXCI6IFwidW5pbnRlcnByZXRlZF9vcHRpb25cIiwgXCJudW1iZXJcIjogOTk5LCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMywgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuVW5pbnRlcnByZXRlZE9wdGlvblwiIH1dLCBcImV4dGVuc2lvblJhbmdlXCI6IFt7IFwic3RhcnRcIjogMTAwMCwgXCJlbmRcIjogNTM2ODcwOTEyIH1dIH0sIHsgXCJuYW1lXCI6IFwiRW51bU9wdGlvbnNcIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJhbGxvd19hbGlhc1wiLCBcIm51bWJlclwiOiAyLCBcInR5cGVcIjogOCwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiZGVwcmVjYXRlZFwiLCBcIm51bWJlclwiOiAzLCBcInR5cGVcIjogOCwgXCJsYWJlbFwiOiAxLCBcImRlZmF1bHRWYWx1ZVwiOiBcImZhbHNlXCIgfSwgeyBcIm5hbWVcIjogXCJkZXByZWNhdGVkX2xlZ2FjeV9qc29uX2ZpZWxkX2NvbmZsaWN0c1wiLCBcIm51bWJlclwiOiA2LCBcInR5cGVcIjogOCwgXCJsYWJlbFwiOiAxLCBcIm9wdGlvbnNcIjogeyBcImRlcHJlY2F0ZWRcIjogdHJ1ZSB9IH0sIHsgXCJuYW1lXCI6IFwiZmVhdHVyZXNcIiwgXCJudW1iZXJcIjogNywgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXRcIiB9LCB7IFwibmFtZVwiOiBcInVuaW50ZXJwcmV0ZWRfb3B0aW9uXCIsIFwibnVtYmVyXCI6IDk5OSwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDMsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLlVuaW50ZXJwcmV0ZWRPcHRpb25cIiB9XSwgXCJleHRlbnNpb25SYW5nZVwiOiBbeyBcInN0YXJ0XCI6IDEwMDAsIFwiZW5kXCI6IDUzNjg3MDkxMiB9XSB9LCB7IFwibmFtZVwiOiBcIkVudW1WYWx1ZU9wdGlvbnNcIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJkZXByZWNhdGVkXCIsIFwibnVtYmVyXCI6IDEsIFwidHlwZVwiOiA4LCBcImxhYmVsXCI6IDEsIFwiZGVmYXVsdFZhbHVlXCI6IFwiZmFsc2VcIiB9LCB7IFwibmFtZVwiOiBcImZlYXR1cmVzXCIsIFwibnVtYmVyXCI6IDIsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0XCIgfSwgeyBcIm5hbWVcIjogXCJkZWJ1Z19yZWRhY3RcIiwgXCJudW1iZXJcIjogMywgXCJ0eXBlXCI6IDgsIFwibGFiZWxcIjogMSwgXCJkZWZhdWx0VmFsdWVcIjogXCJmYWxzZVwiIH0sIHsgXCJuYW1lXCI6IFwiZmVhdHVyZV9zdXBwb3J0XCIsIFwibnVtYmVyXCI6IDQsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5GaWVsZE9wdGlvbnMuRmVhdHVyZVN1cHBvcnRcIiB9LCB7IFwibmFtZVwiOiBcInVuaW50ZXJwcmV0ZWRfb3B0aW9uXCIsIFwibnVtYmVyXCI6IDk5OSwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDMsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLlVuaW50ZXJwcmV0ZWRPcHRpb25cIiB9XSwgXCJleHRlbnNpb25SYW5nZVwiOiBbeyBcInN0YXJ0XCI6IDEwMDAsIFwiZW5kXCI6IDUzNjg3MDkxMiB9XSB9LCB7IFwibmFtZVwiOiBcIlNlcnZpY2VPcHRpb25zXCIsIFwiZmllbGRcIjogW3sgXCJuYW1lXCI6IFwiZmVhdHVyZXNcIiwgXCJudW1iZXJcIjogMzQsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0XCIgfSwgeyBcIm5hbWVcIjogXCJkZXByZWNhdGVkXCIsIFwibnVtYmVyXCI6IDMzLCBcInR5cGVcIjogOCwgXCJsYWJlbFwiOiAxLCBcImRlZmF1bHRWYWx1ZVwiOiBcImZhbHNlXCIgfSwgeyBcIm5hbWVcIjogXCJ1bmludGVycHJldGVkX29wdGlvblwiLCBcIm51bWJlclwiOiA5OTksIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAzLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5VbmludGVycHJldGVkT3B0aW9uXCIgfV0sIFwiZXh0ZW5zaW9uUmFuZ2VcIjogW3sgXCJzdGFydFwiOiAxMDAwLCBcImVuZFwiOiA1MzY4NzA5MTIgfV0gfSwgeyBcIm5hbWVcIjogXCJNZXRob2RPcHRpb25zXCIsIFwiZmllbGRcIjogW3sgXCJuYW1lXCI6IFwiZGVwcmVjYXRlZFwiLCBcIm51bWJlclwiOiAzMywgXCJ0eXBlXCI6IDgsIFwibGFiZWxcIjogMSwgXCJkZWZhdWx0VmFsdWVcIjogXCJmYWxzZVwiIH0sIHsgXCJuYW1lXCI6IFwiaWRlbXBvdGVuY3lfbGV2ZWxcIiwgXCJudW1iZXJcIjogMzQsIFwidHlwZVwiOiAxNCwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5NZXRob2RPcHRpb25zLklkZW1wb3RlbmN5TGV2ZWxcIiwgXCJkZWZhdWx0VmFsdWVcIjogXCJJREVNUE9URU5DWV9VTktOT1dOXCIgfSwgeyBcIm5hbWVcIjogXCJmZWF0dXJlc1wiLCBcIm51bWJlclwiOiAzNSwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXRcIiB9LCB7IFwibmFtZVwiOiBcInVuaW50ZXJwcmV0ZWRfb3B0aW9uXCIsIFwibnVtYmVyXCI6IDk5OSwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDMsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLlVuaW50ZXJwcmV0ZWRPcHRpb25cIiB9XSwgXCJlbnVtVHlwZVwiOiBbeyBcIm5hbWVcIjogXCJJZGVtcG90ZW5jeUxldmVsXCIsIFwidmFsdWVcIjogW3sgXCJuYW1lXCI6IFwiSURFTVBPVEVOQ1lfVU5LTk9XTlwiLCBcIm51bWJlclwiOiAwIH0sIHsgXCJuYW1lXCI6IFwiTk9fU0lERV9FRkZFQ1RTXCIsIFwibnVtYmVyXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJJREVNUE9URU5UXCIsIFwibnVtYmVyXCI6IDIgfV0gfV0sIFwiZXh0ZW5zaW9uUmFuZ2VcIjogW3sgXCJzdGFydFwiOiAxMDAwLCBcImVuZFwiOiA1MzY4NzA5MTIgfV0gfSwgeyBcIm5hbWVcIjogXCJVbmludGVycHJldGVkT3B0aW9uXCIsIFwiZmllbGRcIjogW3sgXCJuYW1lXCI6IFwibmFtZVwiLCBcIm51bWJlclwiOiAyLCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMywgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuVW5pbnRlcnByZXRlZE9wdGlvbi5OYW1lUGFydFwiIH0sIHsgXCJuYW1lXCI6IFwiaWRlbnRpZmllcl92YWx1ZVwiLCBcIm51bWJlclwiOiAzLCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwicG9zaXRpdmVfaW50X3ZhbHVlXCIsIFwibnVtYmVyXCI6IDQsIFwidHlwZVwiOiA0LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJuZWdhdGl2ZV9pbnRfdmFsdWVcIiwgXCJudW1iZXJcIjogNSwgXCJ0eXBlXCI6IDMsIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcImRvdWJsZV92YWx1ZVwiLCBcIm51bWJlclwiOiA2LCBcInR5cGVcIjogMSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwic3RyaW5nX3ZhbHVlXCIsIFwibnVtYmVyXCI6IDcsIFwidHlwZVwiOiAxMiwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiYWdncmVnYXRlX3ZhbHVlXCIsIFwibnVtYmVyXCI6IDgsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfV0sIFwibmVzdGVkVHlwZVwiOiBbeyBcIm5hbWVcIjogXCJOYW1lUGFydFwiLCBcImZpZWxkXCI6IFt7IFwibmFtZVwiOiBcIm5hbWVfcGFydFwiLCBcIm51bWJlclwiOiAxLCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAyIH0sIHsgXCJuYW1lXCI6IFwiaXNfZXh0ZW5zaW9uXCIsIFwibnVtYmVyXCI6IDIsIFwidHlwZVwiOiA4LCBcImxhYmVsXCI6IDIgfV0gfV0gfSwgeyBcIm5hbWVcIjogXCJGZWF0dXJlU2V0XCIsIFwiZmllbGRcIjogW3sgXCJuYW1lXCI6IFwiZmllbGRfcHJlc2VuY2VcIiwgXCJudW1iZXJcIjogMSwgXCJ0eXBlXCI6IDE0LCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXQuRmllbGRQcmVzZW5jZVwiLCBcIm9wdGlvbnNcIjogeyBcInJldGVudGlvblwiOiAxLCBcInRhcmdldHNcIjogWzQsIDFdLCBcImVkaXRpb25EZWZhdWx0c1wiOiBbeyBcInZhbHVlXCI6IFwiRVhQTElDSVRcIiwgXCJlZGl0aW9uXCI6IDkwMCB9LCB7IFwidmFsdWVcIjogXCJJTVBMSUNJVFwiLCBcImVkaXRpb25cIjogOTk5IH0sIHsgXCJ2YWx1ZVwiOiBcIkVYUExJQ0lUXCIsIFwiZWRpdGlvblwiOiAxMDAwIH1dIH0gfSwgeyBcIm5hbWVcIjogXCJlbnVtX3R5cGVcIiwgXCJudW1iZXJcIjogMiwgXCJ0eXBlXCI6IDE0LCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXQuRW51bVR5cGVcIiwgXCJvcHRpb25zXCI6IHsgXCJyZXRlbnRpb25cIjogMSwgXCJ0YXJnZXRzXCI6IFs2LCAxXSwgXCJlZGl0aW9uRGVmYXVsdHNcIjogW3sgXCJ2YWx1ZVwiOiBcIkNMT1NFRFwiLCBcImVkaXRpb25cIjogOTAwIH0sIHsgXCJ2YWx1ZVwiOiBcIk9QRU5cIiwgXCJlZGl0aW9uXCI6IDk5OSB9XSB9IH0sIHsgXCJuYW1lXCI6IFwicmVwZWF0ZWRfZmllbGRfZW5jb2RpbmdcIiwgXCJudW1iZXJcIjogMywgXCJ0eXBlXCI6IDE0LCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXQuUmVwZWF0ZWRGaWVsZEVuY29kaW5nXCIsIFwib3B0aW9uc1wiOiB7IFwicmV0ZW50aW9uXCI6IDEsIFwidGFyZ2V0c1wiOiBbNCwgMV0sIFwiZWRpdGlvbkRlZmF1bHRzXCI6IFt7IFwidmFsdWVcIjogXCJFWFBBTkRFRFwiLCBcImVkaXRpb25cIjogOTAwIH0sIHsgXCJ2YWx1ZVwiOiBcIlBBQ0tFRFwiLCBcImVkaXRpb25cIjogOTk5IH1dIH0gfSwgeyBcIm5hbWVcIjogXCJ1dGY4X3ZhbGlkYXRpb25cIiwgXCJudW1iZXJcIjogNCwgXCJ0eXBlXCI6IDE0LCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXQuVXRmOFZhbGlkYXRpb25cIiwgXCJvcHRpb25zXCI6IHsgXCJyZXRlbnRpb25cIjogMSwgXCJ0YXJnZXRzXCI6IFs0LCAxXSwgXCJlZGl0aW9uRGVmYXVsdHNcIjogW3sgXCJ2YWx1ZVwiOiBcIk5PTkVcIiwgXCJlZGl0aW9uXCI6IDkwMCB9LCB7IFwidmFsdWVcIjogXCJWRVJJRllcIiwgXCJlZGl0aW9uXCI6IDk5OSB9XSB9IH0sIHsgXCJuYW1lXCI6IFwibWVzc2FnZV9lbmNvZGluZ1wiLCBcIm51bWJlclwiOiA1LCBcInR5cGVcIjogMTQsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmVhdHVyZVNldC5NZXNzYWdlRW5jb2RpbmdcIiwgXCJvcHRpb25zXCI6IHsgXCJyZXRlbnRpb25cIjogMSwgXCJ0YXJnZXRzXCI6IFs0LCAxXSwgXCJlZGl0aW9uRGVmYXVsdHNcIjogW3sgXCJ2YWx1ZVwiOiBcIkxFTkdUSF9QUkVGSVhFRFwiLCBcImVkaXRpb25cIjogOTAwIH1dIH0gfSwgeyBcIm5hbWVcIjogXCJqc29uX2Zvcm1hdFwiLCBcIm51bWJlclwiOiA2LCBcInR5cGVcIjogMTQsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmVhdHVyZVNldC5Kc29uRm9ybWF0XCIsIFwib3B0aW9uc1wiOiB7IFwicmV0ZW50aW9uXCI6IDEsIFwidGFyZ2V0c1wiOiBbMywgNiwgMV0sIFwiZWRpdGlvbkRlZmF1bHRzXCI6IFt7IFwidmFsdWVcIjogXCJMRUdBQ1lfQkVTVF9FRkZPUlRcIiwgXCJlZGl0aW9uXCI6IDkwMCB9LCB7IFwidmFsdWVcIjogXCJBTExPV1wiLCBcImVkaXRpb25cIjogOTk5IH1dIH0gfSwgeyBcIm5hbWVcIjogXCJlbmZvcmNlX25hbWluZ19zdHlsZVwiLCBcIm51bWJlclwiOiA3LCBcInR5cGVcIjogMTQsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmVhdHVyZVNldC5FbmZvcmNlTmFtaW5nU3R5bGVcIiwgXCJvcHRpb25zXCI6IHsgXCJyZXRlbnRpb25cIjogMiwgXCJ0YXJnZXRzXCI6IFsxLCAyLCAzLCA0LCA1LCA2LCA3LCA4LCA5XSwgXCJlZGl0aW9uRGVmYXVsdHNcIjogW3sgXCJ2YWx1ZVwiOiBcIlNUWUxFX0xFR0FDWVwiLCBcImVkaXRpb25cIjogOTAwIH0sIHsgXCJ2YWx1ZVwiOiBcIlNUWUxFMjAyNFwiLCBcImVkaXRpb25cIjogMTAwMSB9XSB9IH0sIHsgXCJuYW1lXCI6IFwiZGVmYXVsdF9zeW1ib2xfdmlzaWJpbGl0eVwiLCBcIm51bWJlclwiOiA4LCBcInR5cGVcIjogMTQsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmVhdHVyZVNldC5WaXNpYmlsaXR5RmVhdHVyZS5EZWZhdWx0U3ltYm9sVmlzaWJpbGl0eVwiLCBcIm9wdGlvbnNcIjogeyBcInJldGVudGlvblwiOiAyLCBcInRhcmdldHNcIjogWzFdLCBcImVkaXRpb25EZWZhdWx0c1wiOiBbeyBcInZhbHVlXCI6IFwiRVhQT1JUX0FMTFwiLCBcImVkaXRpb25cIjogOTAwIH0sIHsgXCJ2YWx1ZVwiOiBcIkVYUE9SVF9UT1BfTEVWRUxcIiwgXCJlZGl0aW9uXCI6IDEwMDEgfV0gfSB9XSwgXCJuZXN0ZWRUeXBlXCI6IFt7IFwibmFtZVwiOiBcIlZpc2liaWxpdHlGZWF0dXJlXCIsIFwiZW51bVR5cGVcIjogW3sgXCJuYW1lXCI6IFwiRGVmYXVsdFN5bWJvbFZpc2liaWxpdHlcIiwgXCJ2YWx1ZVwiOiBbeyBcIm5hbWVcIjogXCJERUZBVUxUX1NZTUJPTF9WSVNJQklMSVRZX1VOS05PV05cIiwgXCJudW1iZXJcIjogMCB9LCB7IFwibmFtZVwiOiBcIkVYUE9SVF9BTExcIiwgXCJudW1iZXJcIjogMSB9LCB7IFwibmFtZVwiOiBcIkVYUE9SVF9UT1BfTEVWRUxcIiwgXCJudW1iZXJcIjogMiB9LCB7IFwibmFtZVwiOiBcIkxPQ0FMX0FMTFwiLCBcIm51bWJlclwiOiAzIH0sIHsgXCJuYW1lXCI6IFwiU1RSSUNUXCIsIFwibnVtYmVyXCI6IDQgfV0gfV0gfV0sIFwiZW51bVR5cGVcIjogW3sgXCJuYW1lXCI6IFwiRmllbGRQcmVzZW5jZVwiLCBcInZhbHVlXCI6IFt7IFwibmFtZVwiOiBcIkZJRUxEX1BSRVNFTkNFX1VOS05PV05cIiwgXCJudW1iZXJcIjogMCB9LCB7IFwibmFtZVwiOiBcIkVYUExJQ0lUXCIsIFwibnVtYmVyXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJJTVBMSUNJVFwiLCBcIm51bWJlclwiOiAyIH0sIHsgXCJuYW1lXCI6IFwiTEVHQUNZX1JFUVVJUkVEXCIsIFwibnVtYmVyXCI6IDMgfV0gfSwgeyBcIm5hbWVcIjogXCJFbnVtVHlwZVwiLCBcInZhbHVlXCI6IFt7IFwibmFtZVwiOiBcIkVOVU1fVFlQRV9VTktOT1dOXCIsIFwibnVtYmVyXCI6IDAgfSwgeyBcIm5hbWVcIjogXCJPUEVOXCIsIFwibnVtYmVyXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJDTE9TRURcIiwgXCJudW1iZXJcIjogMiB9XSB9LCB7IFwibmFtZVwiOiBcIlJlcGVhdGVkRmllbGRFbmNvZGluZ1wiLCBcInZhbHVlXCI6IFt7IFwibmFtZVwiOiBcIlJFUEVBVEVEX0ZJRUxEX0VOQ09ESU5HX1VOS05PV05cIiwgXCJudW1iZXJcIjogMCB9LCB7IFwibmFtZVwiOiBcIlBBQ0tFRFwiLCBcIm51bWJlclwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiRVhQQU5ERURcIiwgXCJudW1iZXJcIjogMiB9XSB9LCB7IFwibmFtZVwiOiBcIlV0ZjhWYWxpZGF0aW9uXCIsIFwidmFsdWVcIjogW3sgXCJuYW1lXCI6IFwiVVRGOF9WQUxJREFUSU9OX1VOS05PV05cIiwgXCJudW1iZXJcIjogMCB9LCB7IFwibmFtZVwiOiBcIlZFUklGWVwiLCBcIm51bWJlclwiOiAyIH0sIHsgXCJuYW1lXCI6IFwiTk9ORVwiLCBcIm51bWJlclwiOiAzIH1dIH0sIHsgXCJuYW1lXCI6IFwiTWVzc2FnZUVuY29kaW5nXCIsIFwidmFsdWVcIjogW3sgXCJuYW1lXCI6IFwiTUVTU0FHRV9FTkNPRElOR19VTktOT1dOXCIsIFwibnVtYmVyXCI6IDAgfSwgeyBcIm5hbWVcIjogXCJMRU5HVEhfUFJFRklYRURcIiwgXCJudW1iZXJcIjogMSB9LCB7IFwibmFtZVwiOiBcIkRFTElNSVRFRFwiLCBcIm51bWJlclwiOiAyIH1dIH0sIHsgXCJuYW1lXCI6IFwiSnNvbkZvcm1hdFwiLCBcInZhbHVlXCI6IFt7IFwibmFtZVwiOiBcIkpTT05fRk9STUFUX1VOS05PV05cIiwgXCJudW1iZXJcIjogMCB9LCB7IFwibmFtZVwiOiBcIkFMTE9XXCIsIFwibnVtYmVyXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJMRUdBQ1lfQkVTVF9FRkZPUlRcIiwgXCJudW1iZXJcIjogMiB9XSB9LCB7IFwibmFtZVwiOiBcIkVuZm9yY2VOYW1pbmdTdHlsZVwiLCBcInZhbHVlXCI6IFt7IFwibmFtZVwiOiBcIkVORk9SQ0VfTkFNSU5HX1NUWUxFX1VOS05PV05cIiwgXCJudW1iZXJcIjogMCB9LCB7IFwibmFtZVwiOiBcIlNUWUxFMjAyNFwiLCBcIm51bWJlclwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiU1RZTEVfTEVHQUNZXCIsIFwibnVtYmVyXCI6IDIgfV0gfV0sIFwiZXh0ZW5zaW9uUmFuZ2VcIjogW3sgXCJzdGFydFwiOiAxMDAwLCBcImVuZFwiOiA5OTk1IH0sIHsgXCJzdGFydFwiOiA5OTk1LCBcImVuZFwiOiAxMDAwMCB9LCB7IFwic3RhcnRcIjogMTAwMDAsIFwiZW5kXCI6IDEwMDAxIH1dIH0sIHsgXCJuYW1lXCI6IFwiRmVhdHVyZVNldERlZmF1bHRzXCIsIFwiZmllbGRcIjogW3sgXCJuYW1lXCI6IFwiZGVmYXVsdHNcIiwgXCJudW1iZXJcIjogMSwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDMsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXREZWZhdWx0cy5GZWF0dXJlU2V0RWRpdGlvbkRlZmF1bHRcIiB9LCB7IFwibmFtZVwiOiBcIm1pbmltdW1fZWRpdGlvblwiLCBcIm51bWJlclwiOiA0LCBcInR5cGVcIjogMTQsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRWRpdGlvblwiIH0sIHsgXCJuYW1lXCI6IFwibWF4aW11bV9lZGl0aW9uXCIsIFwibnVtYmVyXCI6IDUsIFwidHlwZVwiOiAxNCwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5FZGl0aW9uXCIgfV0sIFwibmVzdGVkVHlwZVwiOiBbeyBcIm5hbWVcIjogXCJGZWF0dXJlU2V0RWRpdGlvbkRlZmF1bHRcIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJlZGl0aW9uXCIsIFwibnVtYmVyXCI6IDMsIFwidHlwZVwiOiAxNCwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5FZGl0aW9uXCIgfSwgeyBcIm5hbWVcIjogXCJvdmVycmlkYWJsZV9mZWF0dXJlc1wiLCBcIm51bWJlclwiOiA0LCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmVhdHVyZVNldFwiIH0sIHsgXCJuYW1lXCI6IFwiZml4ZWRfZmVhdHVyZXNcIiwgXCJudW1iZXJcIjogNSwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXRcIiB9XSB9XSB9LCB7IFwibmFtZVwiOiBcIlNvdXJjZUNvZGVJbmZvXCIsIFwiZmllbGRcIjogW3sgXCJuYW1lXCI6IFwibG9jYXRpb25cIiwgXCJudW1iZXJcIjogMSwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDMsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLlNvdXJjZUNvZGVJbmZvLkxvY2F0aW9uXCIgfV0sIFwibmVzdGVkVHlwZVwiOiBbeyBcIm5hbWVcIjogXCJMb2NhdGlvblwiLCBcImZpZWxkXCI6IFt7IFwibmFtZVwiOiBcInBhdGhcIiwgXCJudW1iZXJcIjogMSwgXCJ0eXBlXCI6IDUsIFwibGFiZWxcIjogMywgXCJvcHRpb25zXCI6IHsgXCJwYWNrZWRcIjogdHJ1ZSB9IH0sIHsgXCJuYW1lXCI6IFwic3BhblwiLCBcIm51bWJlclwiOiAyLCBcInR5cGVcIjogNSwgXCJsYWJlbFwiOiAzLCBcIm9wdGlvbnNcIjogeyBcInBhY2tlZFwiOiB0cnVlIH0gfSwgeyBcIm5hbWVcIjogXCJsZWFkaW5nX2NvbW1lbnRzXCIsIFwibnVtYmVyXCI6IDMsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJ0cmFpbGluZ19jb21tZW50c1wiLCBcIm51bWJlclwiOiA0LCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwibGVhZGluZ19kZXRhY2hlZF9jb21tZW50c1wiLCBcIm51bWJlclwiOiA2LCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAzIH1dIH1dLCBcImV4dGVuc2lvblJhbmdlXCI6IFt7IFwic3RhcnRcIjogNTM2MDAwMDAwLCBcImVuZFwiOiA1MzYwMDAwMDEgfV0gfSwgeyBcIm5hbWVcIjogXCJHZW5lcmF0ZWRDb2RlSW5mb1wiLCBcImZpZWxkXCI6IFt7IFwibmFtZVwiOiBcImFubm90YXRpb25cIiwgXCJudW1iZXJcIjogMSwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDMsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkdlbmVyYXRlZENvZGVJbmZvLkFubm90YXRpb25cIiB9XSwgXCJuZXN0ZWRUeXBlXCI6IFt7IFwibmFtZVwiOiBcIkFubm90YXRpb25cIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJwYXRoXCIsIFwibnVtYmVyXCI6IDEsIFwidHlwZVwiOiA1LCBcImxhYmVsXCI6IDMsIFwib3B0aW9uc1wiOiB7IFwicGFja2VkXCI6IHRydWUgfSB9LCB7IFwibmFtZVwiOiBcInNvdXJjZV9maWxlXCIsIFwibnVtYmVyXCI6IDIsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJiZWdpblwiLCBcIm51bWJlclwiOiAzLCBcInR5cGVcIjogNSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiZW5kXCIsIFwibnVtYmVyXCI6IDQsIFwidHlwZVwiOiA1LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJzZW1hbnRpY1wiLCBcIm51bWJlclwiOiA1LCBcInR5cGVcIjogMTQsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuR2VuZXJhdGVkQ29kZUluZm8uQW5ub3RhdGlvbi5TZW1hbnRpY1wiIH1dLCBcImVudW1UeXBlXCI6IFt7IFwibmFtZVwiOiBcIlNlbWFudGljXCIsIFwidmFsdWVcIjogW3sgXCJuYW1lXCI6IFwiTk9ORVwiLCBcIm51bWJlclwiOiAwIH0sIHsgXCJuYW1lXCI6IFwiU0VUXCIsIFwibnVtYmVyXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJBTElBU1wiLCBcIm51bWJlclwiOiAyIH1dIH1dIH1dIH1dLCBcImVudW1UeXBlXCI6IFt7IFwibmFtZVwiOiBcIkVkaXRpb25cIiwgXCJ2YWx1ZVwiOiBbeyBcIm5hbWVcIjogXCJFRElUSU9OX1VOS05PV05cIiwgXCJudW1iZXJcIjogMCB9LCB7IFwibmFtZVwiOiBcIkVESVRJT05fTEVHQUNZXCIsIFwibnVtYmVyXCI6IDkwMCB9LCB7IFwibmFtZVwiOiBcIkVESVRJT05fUFJPVE8yXCIsIFwibnVtYmVyXCI6IDk5OCB9LCB7IFwibmFtZVwiOiBcIkVESVRJT05fUFJPVE8zXCIsIFwibnVtYmVyXCI6IDk5OSB9LCB7IFwibmFtZVwiOiBcIkVESVRJT05fMjAyM1wiLCBcIm51bWJlclwiOiAxMDAwIH0sIHsgXCJuYW1lXCI6IFwiRURJVElPTl8yMDI0XCIsIFwibnVtYmVyXCI6IDEwMDEgfSwgeyBcIm5hbWVcIjogXCJFRElUSU9OXzFfVEVTVF9PTkxZXCIsIFwibnVtYmVyXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJFRElUSU9OXzJfVEVTVF9PTkxZXCIsIFwibnVtYmVyXCI6IDIgfSwgeyBcIm5hbWVcIjogXCJFRElUSU9OXzk5OTk3X1RFU1RfT05MWVwiLCBcIm51bWJlclwiOiA5OTk5NyB9LCB7IFwibmFtZVwiOiBcIkVESVRJT05fOTk5OThfVEVTVF9PTkxZXCIsIFwibnVtYmVyXCI6IDk5OTk4IH0sIHsgXCJuYW1lXCI6IFwiRURJVElPTl85OTk5OV9URVNUX09OTFlcIiwgXCJudW1iZXJcIjogOTk5OTkgfSwgeyBcIm5hbWVcIjogXCJFRElUSU9OX01BWFwiLCBcIm51bWJlclwiOiAyMTQ3NDgzNjQ3IH1dIH0sIHsgXCJuYW1lXCI6IFwiU3ltYm9sVmlzaWJpbGl0eVwiLCBcInZhbHVlXCI6IFt7IFwibmFtZVwiOiBcIlZJU0lCSUxJVFlfVU5TRVRcIiwgXCJudW1iZXJcIjogMCB9LCB7IFwibmFtZVwiOiBcIlZJU0lCSUxJVFlfTE9DQUxcIiwgXCJudW1iZXJcIjogMSB9LCB7IFwibmFtZVwiOiBcIlZJU0lCSUxJVFlfRVhQT1JUXCIsIFwibnVtYmVyXCI6IDIgfV0gfV0gfSk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBnb29nbGUucHJvdG9idWYuRmlsZURlc2NyaXB0b3JTZXQuXG4gKiBVc2UgYGNyZWF0ZShGaWxlRGVzY3JpcHRvclNldFNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgRmlsZURlc2NyaXB0b3JTZXRTY2hlbWEgPSAvKkBfX1BVUkVfXyovIG1lc3NhZ2VEZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDApO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLkZpbGVEZXNjcmlwdG9yUHJvdG8uXG4gKiBVc2UgYGNyZWF0ZShGaWxlRGVzY3JpcHRvclByb3RvU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBGaWxlRGVzY3JpcHRvclByb3RvU2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAxKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5EZXNjcmlwdG9yUHJvdG8uXG4gKiBVc2UgYGNyZWF0ZShEZXNjcmlwdG9yUHJvdG9TY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IERlc2NyaXB0b3JQcm90b1NjaGVtYSA9IC8qQF9fUFVSRV9fKi8gbWVzc2FnZURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMik7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBnb29nbGUucHJvdG9idWYuRGVzY3JpcHRvclByb3RvLkV4dGVuc2lvblJhbmdlLlxuICogVXNlIGBjcmVhdGUoRGVzY3JpcHRvclByb3RvX0V4dGVuc2lvblJhbmdlU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBEZXNjcmlwdG9yUHJvdG9fRXh0ZW5zaW9uUmFuZ2VTY2hlbWEgPSAvKkBfX1BVUkVfXyovIG1lc3NhZ2VEZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDIsIDApO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLkRlc2NyaXB0b3JQcm90by5SZXNlcnZlZFJhbmdlLlxuICogVXNlIGBjcmVhdGUoRGVzY3JpcHRvclByb3RvX1Jlc2VydmVkUmFuZ2VTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IERlc2NyaXB0b3JQcm90b19SZXNlcnZlZFJhbmdlU2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAyLCAxKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5FeHRlbnNpb25SYW5nZU9wdGlvbnMuXG4gKiBVc2UgYGNyZWF0ZShFeHRlbnNpb25SYW5nZU9wdGlvbnNTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEV4dGVuc2lvblJhbmdlT3B0aW9uc1NjaGVtYSA9IC8qQF9fUFVSRV9fKi8gbWVzc2FnZURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMyk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBnb29nbGUucHJvdG9idWYuRXh0ZW5zaW9uUmFuZ2VPcHRpb25zLkRlY2xhcmF0aW9uLlxuICogVXNlIGBjcmVhdGUoRXh0ZW5zaW9uUmFuZ2VPcHRpb25zX0RlY2xhcmF0aW9uU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBFeHRlbnNpb25SYW5nZU9wdGlvbnNfRGVjbGFyYXRpb25TY2hlbWEgPSAvKkBfX1BVUkVfXyovIG1lc3NhZ2VEZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDMsIDApO1xuLyoqXG4gKiBUaGUgdmVyaWZpY2F0aW9uIHN0YXRlIG9mIHRoZSBleHRlbnNpb24gcmFuZ2UuXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIGVudW0gZ29vZ2xlLnByb3RvYnVmLkV4dGVuc2lvblJhbmdlT3B0aW9ucy5WZXJpZmljYXRpb25TdGF0ZVxuICovXG5leHBvcnQgdmFyIEV4dGVuc2lvblJhbmdlT3B0aW9uc19WZXJpZmljYXRpb25TdGF0ZTtcbihmdW5jdGlvbiAoRXh0ZW5zaW9uUmFuZ2VPcHRpb25zX1ZlcmlmaWNhdGlvblN0YXRlKSB7XG4gICAgLyoqXG4gICAgICogQWxsIHRoZSBleHRlbnNpb25zIG9mIHRoZSByYW5nZSBtdXN0IGJlIGRlY2xhcmVkLlxuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IERFQ0xBUkFUSU9OID0gMDtcbiAgICAgKi9cbiAgICBFeHRlbnNpb25SYW5nZU9wdGlvbnNfVmVyaWZpY2F0aW9uU3RhdGVbRXh0ZW5zaW9uUmFuZ2VPcHRpb25zX1ZlcmlmaWNhdGlvblN0YXRlW1wiREVDTEFSQVRJT05cIl0gPSAwXSA9IFwiREVDTEFSQVRJT05cIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVU5WRVJJRklFRCA9IDE7XG4gICAgICovXG4gICAgRXh0ZW5zaW9uUmFuZ2VPcHRpb25zX1ZlcmlmaWNhdGlvblN0YXRlW0V4dGVuc2lvblJhbmdlT3B0aW9uc19WZXJpZmljYXRpb25TdGF0ZVtcIlVOVkVSSUZJRURcIl0gPSAxXSA9IFwiVU5WRVJJRklFRFwiO1xufSkoRXh0ZW5zaW9uUmFuZ2VPcHRpb25zX1ZlcmlmaWNhdGlvblN0YXRlIHx8IChFeHRlbnNpb25SYW5nZU9wdGlvbnNfVmVyaWZpY2F0aW9uU3RhdGUgPSB7fSkpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIGVudW0gZ29vZ2xlLnByb3RvYnVmLkV4dGVuc2lvblJhbmdlT3B0aW9ucy5WZXJpZmljYXRpb25TdGF0ZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEV4dGVuc2lvblJhbmdlT3B0aW9uc19WZXJpZmljYXRpb25TdGF0ZVNjaGVtYSA9IC8qQF9fUFVSRV9fKi8gZW51bURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMywgMCk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBnb29nbGUucHJvdG9idWYuRmllbGREZXNjcmlwdG9yUHJvdG8uXG4gKiBVc2UgYGNyZWF0ZShGaWVsZERlc2NyaXB0b3JQcm90b1NjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgRmllbGREZXNjcmlwdG9yUHJvdG9TY2hlbWEgPSAvKkBfX1BVUkVfXyovIG1lc3NhZ2VEZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDQpO1xuLyoqXG4gKiBAZ2VuZXJhdGVkIGZyb20gZW51bSBnb29nbGUucHJvdG9idWYuRmllbGREZXNjcmlwdG9yUHJvdG8uVHlwZVxuICovXG5leHBvcnQgdmFyIEZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGU7XG4oZnVuY3Rpb24gKEZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGUpIHtcbiAgICAvKipcbiAgICAgKiAwIGlzIHJlc2VydmVkIGZvciBlcnJvcnMuXG4gICAgICogT3JkZXIgaXMgd2VpcmQgZm9yIGhpc3RvcmljYWwgcmVhc29ucy5cbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBUWVBFX0RPVUJMRSA9IDE7XG4gICAgICovXG4gICAgRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW1wiRE9VQkxFXCJdID0gMV0gPSBcIkRPVUJMRVwiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBUWVBFX0ZMT0FUID0gMjtcbiAgICAgKi9cbiAgICBGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW0ZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGVbXCJGTE9BVFwiXSA9IDJdID0gXCJGTE9BVFwiO1xuICAgIC8qKlxuICAgICAqIE5vdCBaaWdaYWcgZW5jb2RlZC4gIE5lZ2F0aXZlIG51bWJlcnMgdGFrZSAxMCBieXRlcy4gIFVzZSBUWVBFX1NJTlQ2NCBpZlxuICAgICAqIG5lZ2F0aXZlIHZhbHVlcyBhcmUgbGlrZWx5LlxuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFRZUEVfSU5UNjQgPSAzO1xuICAgICAqL1xuICAgIEZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGVbRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtcIklOVDY0XCJdID0gM10gPSBcIklOVDY0XCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFRZUEVfVUlOVDY0ID0gNDtcbiAgICAgKi9cbiAgICBGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW0ZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGVbXCJVSU5UNjRcIl0gPSA0XSA9IFwiVUlOVDY0XCI7XG4gICAgLyoqXG4gICAgICogTm90IFppZ1phZyBlbmNvZGVkLiAgTmVnYXRpdmUgbnVtYmVycyB0YWtlIDEwIGJ5dGVzLiAgVXNlIFRZUEVfU0lOVDMyIGlmXG4gICAgICogbmVnYXRpdmUgdmFsdWVzIGFyZSBsaWtlbHkuXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVFlQRV9JTlQzMiA9IDU7XG4gICAgICovXG4gICAgRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW1wiSU5UMzJcIl0gPSA1XSA9IFwiSU5UMzJcIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVFlQRV9GSVhFRDY0ID0gNjtcbiAgICAgKi9cbiAgICBGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW0ZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGVbXCJGSVhFRDY0XCJdID0gNl0gPSBcIkZJWEVENjRcIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVFlQRV9GSVhFRDMyID0gNztcbiAgICAgKi9cbiAgICBGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW0ZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGVbXCJGSVhFRDMyXCJdID0gN10gPSBcIkZJWEVEMzJcIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVFlQRV9CT09MID0gODtcbiAgICAgKi9cbiAgICBGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW0ZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGVbXCJCT09MXCJdID0gOF0gPSBcIkJPT0xcIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVFlQRV9TVFJJTkcgPSA5O1xuICAgICAqL1xuICAgIEZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGVbRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtcIlNUUklOR1wiXSA9IDldID0gXCJTVFJJTkdcIjtcbiAgICAvKipcbiAgICAgKiBUYWctZGVsaW1pdGVkIGFnZ3JlZ2F0ZS5cbiAgICAgKiBHcm91cCB0eXBlIGlzIGRlcHJlY2F0ZWQgYW5kIG5vdCBzdXBwb3J0ZWQgYWZ0ZXIgZ29vZ2xlLnByb3RvYnVmLiBIb3dldmVyLCBQcm90bzNcbiAgICAgKiBpbXBsZW1lbnRhdGlvbnMgc2hvdWxkIHN0aWxsIGJlIGFibGUgdG8gcGFyc2UgdGhlIGdyb3VwIHdpcmUgZm9ybWF0IGFuZFxuICAgICAqIHRyZWF0IGdyb3VwIGZpZWxkcyBhcyB1bmtub3duIGZpZWxkcy4gIEluIEVkaXRpb25zLCB0aGUgZ3JvdXAgd2lyZSBmb3JtYXRcbiAgICAgKiBjYW4gYmUgZW5hYmxlZCB2aWEgdGhlIGBtZXNzYWdlX2VuY29kaW5nYCBmZWF0dXJlLlxuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFRZUEVfR1JPVVAgPSAxMDtcbiAgICAgKi9cbiAgICBGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW0ZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGVbXCJHUk9VUFwiXSA9IDEwXSA9IFwiR1JPVVBcIjtcbiAgICAvKipcbiAgICAgKiBMZW5ndGgtZGVsaW1pdGVkIGFnZ3JlZ2F0ZS5cbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBUWVBFX01FU1NBR0UgPSAxMTtcbiAgICAgKi9cbiAgICBGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW0ZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGVbXCJNRVNTQUdFXCJdID0gMTFdID0gXCJNRVNTQUdFXCI7XG4gICAgLyoqXG4gICAgICogTmV3IGluIHZlcnNpb24gMi5cbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBUWVBFX0JZVEVTID0gMTI7XG4gICAgICovXG4gICAgRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW1wiQllURVNcIl0gPSAxMl0gPSBcIkJZVEVTXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFRZUEVfVUlOVDMyID0gMTM7XG4gICAgICovXG4gICAgRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW1wiVUlOVDMyXCJdID0gMTNdID0gXCJVSU5UMzJcIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVFlQRV9FTlVNID0gMTQ7XG4gICAgICovXG4gICAgRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW1wiRU5VTVwiXSA9IDE0XSA9IFwiRU5VTVwiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBUWVBFX1NGSVhFRDMyID0gMTU7XG4gICAgICovXG4gICAgRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW1wiU0ZJWEVEMzJcIl0gPSAxNV0gPSBcIlNGSVhFRDMyXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFRZUEVfU0ZJWEVENjQgPSAxNjtcbiAgICAgKi9cbiAgICBGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW0ZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGVbXCJTRklYRUQ2NFwiXSA9IDE2XSA9IFwiU0ZJWEVENjRcIjtcbiAgICAvKipcbiAgICAgKiBVc2VzIFppZ1phZyBlbmNvZGluZy5cbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBUWVBFX1NJTlQzMiA9IDE3O1xuICAgICAqL1xuICAgIEZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGVbRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtcIlNJTlQzMlwiXSA9IDE3XSA9IFwiU0lOVDMyXCI7XG4gICAgLyoqXG4gICAgICogVXNlcyBaaWdaYWcgZW5jb2RpbmcuXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVFlQRV9TSU5UNjQgPSAxODtcbiAgICAgKi9cbiAgICBGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW0ZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGVbXCJTSU5UNjRcIl0gPSAxOF0gPSBcIlNJTlQ2NFwiO1xufSkoRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZSB8fCAoRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZSA9IHt9KSk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgZW51bSBnb29nbGUucHJvdG9idWYuRmllbGREZXNjcmlwdG9yUHJvdG8uVHlwZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGVTY2hlbWEgPSAvKkBfX1BVUkVfXyovIGVudW1EZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDQsIDApO1xuLyoqXG4gKiBAZ2VuZXJhdGVkIGZyb20gZW51bSBnb29nbGUucHJvdG9idWYuRmllbGREZXNjcmlwdG9yUHJvdG8uTGFiZWxcbiAqL1xuZXhwb3J0IHZhciBGaWVsZERlc2NyaXB0b3JQcm90b19MYWJlbDtcbihmdW5jdGlvbiAoRmllbGREZXNjcmlwdG9yUHJvdG9fTGFiZWwpIHtcbiAgICAvKipcbiAgICAgKiAwIGlzIHJlc2VydmVkIGZvciBlcnJvcnNcbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBMQUJFTF9PUFRJT05BTCA9IDE7XG4gICAgICovXG4gICAgRmllbGREZXNjcmlwdG9yUHJvdG9fTGFiZWxbRmllbGREZXNjcmlwdG9yUHJvdG9fTGFiZWxbXCJPUFRJT05BTFwiXSA9IDFdID0gXCJPUFRJT05BTFwiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBMQUJFTF9SRVBFQVRFRCA9IDM7XG4gICAgICovXG4gICAgRmllbGREZXNjcmlwdG9yUHJvdG9fTGFiZWxbRmllbGREZXNjcmlwdG9yUHJvdG9fTGFiZWxbXCJSRVBFQVRFRFwiXSA9IDNdID0gXCJSRVBFQVRFRFwiO1xuICAgIC8qKlxuICAgICAqIFRoZSByZXF1aXJlZCBsYWJlbCBpcyBvbmx5IGFsbG93ZWQgaW4gZ29vZ2xlLnByb3RvYnVmLiAgSW4gcHJvdG8zIGFuZCBFZGl0aW9uc1xuICAgICAqIGl0J3MgZXhwbGljaXRseSBwcm9oaWJpdGVkLiAgSW4gRWRpdGlvbnMsIHRoZSBgZmllbGRfcHJlc2VuY2VgIGZlYXR1cmVcbiAgICAgKiBjYW4gYmUgdXNlZCB0byBnZXQgdGhpcyBiZWhhdmlvci5cbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBMQUJFTF9SRVFVSVJFRCA9IDI7XG4gICAgICovXG4gICAgRmllbGREZXNjcmlwdG9yUHJvdG9fTGFiZWxbRmllbGREZXNjcmlwdG9yUHJvdG9fTGFiZWxbXCJSRVFVSVJFRFwiXSA9IDJdID0gXCJSRVFVSVJFRFwiO1xufSkoRmllbGREZXNjcmlwdG9yUHJvdG9fTGFiZWwgfHwgKEZpZWxkRGVzY3JpcHRvclByb3RvX0xhYmVsID0ge30pKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5GaWVsZERlc2NyaXB0b3JQcm90by5MYWJlbC5cbiAqL1xuZXhwb3J0IGNvbnN0IEZpZWxkRGVzY3JpcHRvclByb3RvX0xhYmVsU2NoZW1hID0gLypAX19QVVJFX18qLyBlbnVtRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCA0LCAxKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5PbmVvZkRlc2NyaXB0b3JQcm90by5cbiAqIFVzZSBgY3JlYXRlKE9uZW9mRGVzY3JpcHRvclByb3RvU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBPbmVvZkRlc2NyaXB0b3JQcm90b1NjaGVtYSA9IC8qQF9fUFVSRV9fKi8gbWVzc2FnZURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgNSk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBnb29nbGUucHJvdG9idWYuRW51bURlc2NyaXB0b3JQcm90by5cbiAqIFVzZSBgY3JlYXRlKEVudW1EZXNjcmlwdG9yUHJvdG9TY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEVudW1EZXNjcmlwdG9yUHJvdG9TY2hlbWEgPSAvKkBfX1BVUkVfXyovIG1lc3NhZ2VEZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDYpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLkVudW1EZXNjcmlwdG9yUHJvdG8uRW51bVJlc2VydmVkUmFuZ2UuXG4gKiBVc2UgYGNyZWF0ZShFbnVtRGVzY3JpcHRvclByb3RvX0VudW1SZXNlcnZlZFJhbmdlU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBFbnVtRGVzY3JpcHRvclByb3RvX0VudW1SZXNlcnZlZFJhbmdlU2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCA2LCAwKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5FbnVtVmFsdWVEZXNjcmlwdG9yUHJvdG8uXG4gKiBVc2UgYGNyZWF0ZShFbnVtVmFsdWVEZXNjcmlwdG9yUHJvdG9TY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEVudW1WYWx1ZURlc2NyaXB0b3JQcm90b1NjaGVtYSA9IC8qQF9fUFVSRV9fKi8gbWVzc2FnZURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgNyk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBnb29nbGUucHJvdG9idWYuU2VydmljZURlc2NyaXB0b3JQcm90by5cbiAqIFVzZSBgY3JlYXRlKFNlcnZpY2VEZXNjcmlwdG9yUHJvdG9TY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IFNlcnZpY2VEZXNjcmlwdG9yUHJvdG9TY2hlbWEgPSAvKkBfX1BVUkVfXyovIG1lc3NhZ2VEZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDgpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLk1ldGhvZERlc2NyaXB0b3JQcm90by5cbiAqIFVzZSBgY3JlYXRlKE1ldGhvZERlc2NyaXB0b3JQcm90b1NjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgTWV0aG9kRGVzY3JpcHRvclByb3RvU2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCA5KTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5GaWxlT3B0aW9ucy5cbiAqIFVzZSBgY3JlYXRlKEZpbGVPcHRpb25zU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBGaWxlT3B0aW9uc1NjaGVtYSA9IC8qQF9fUFVSRV9fKi8gbWVzc2FnZURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMTApO1xuLyoqXG4gKiBHZW5lcmF0ZWQgY2xhc3NlcyBjYW4gYmUgb3B0aW1pemVkIGZvciBzcGVlZCBvciBjb2RlIHNpemUuXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIGVudW0gZ29vZ2xlLnByb3RvYnVmLkZpbGVPcHRpb25zLk9wdGltaXplTW9kZVxuICovXG5leHBvcnQgdmFyIEZpbGVPcHRpb25zX09wdGltaXplTW9kZTtcbihmdW5jdGlvbiAoRmlsZU9wdGlvbnNfT3B0aW1pemVNb2RlKSB7XG4gICAgLyoqXG4gICAgICogR2VuZXJhdGUgY29tcGxldGUgY29kZSBmb3IgcGFyc2luZywgc2VyaWFsaXphdGlvbixcbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBTUEVFRCA9IDE7XG4gICAgICovXG4gICAgRmlsZU9wdGlvbnNfT3B0aW1pemVNb2RlW0ZpbGVPcHRpb25zX09wdGltaXplTW9kZVtcIlNQRUVEXCJdID0gMV0gPSBcIlNQRUVEXCI7XG4gICAgLyoqXG4gICAgICogZXRjLlxuICAgICAqXG4gICAgICogVXNlIFJlZmxlY3Rpb25PcHMgdG8gaW1wbGVtZW50IHRoZXNlIG1ldGhvZHMuXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogQ09ERV9TSVpFID0gMjtcbiAgICAgKi9cbiAgICBGaWxlT3B0aW9uc19PcHRpbWl6ZU1vZGVbRmlsZU9wdGlvbnNfT3B0aW1pemVNb2RlW1wiQ09ERV9TSVpFXCJdID0gMl0gPSBcIkNPREVfU0laRVwiO1xuICAgIC8qKlxuICAgICAqIEdlbmVyYXRlIGNvZGUgdXNpbmcgTWVzc2FnZUxpdGUgYW5kIHRoZSBsaXRlIHJ1bnRpbWUuXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogTElURV9SVU5USU1FID0gMztcbiAgICAgKi9cbiAgICBGaWxlT3B0aW9uc19PcHRpbWl6ZU1vZGVbRmlsZU9wdGlvbnNfT3B0aW1pemVNb2RlW1wiTElURV9SVU5USU1FXCJdID0gM10gPSBcIkxJVEVfUlVOVElNRVwiO1xufSkoRmlsZU9wdGlvbnNfT3B0aW1pemVNb2RlIHx8IChGaWxlT3B0aW9uc19PcHRpbWl6ZU1vZGUgPSB7fSkpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIGVudW0gZ29vZ2xlLnByb3RvYnVmLkZpbGVPcHRpb25zLk9wdGltaXplTW9kZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEZpbGVPcHRpb25zX09wdGltaXplTW9kZVNjaGVtYSA9IC8qQF9fUFVSRV9fKi8gZW51bURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMTAsIDApO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLk1lc3NhZ2VPcHRpb25zLlxuICogVXNlIGBjcmVhdGUoTWVzc2FnZU9wdGlvbnNTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IE1lc3NhZ2VPcHRpb25zU2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAxMSk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBnb29nbGUucHJvdG9idWYuRmllbGRPcHRpb25zLlxuICogVXNlIGBjcmVhdGUoRmllbGRPcHRpb25zU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBGaWVsZE9wdGlvbnNTY2hlbWEgPSAvKkBfX1BVUkVfXyovIG1lc3NhZ2VEZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDEyKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5GaWVsZE9wdGlvbnMuRWRpdGlvbkRlZmF1bHQuXG4gKiBVc2UgYGNyZWF0ZShGaWVsZE9wdGlvbnNfRWRpdGlvbkRlZmF1bHRTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEZpZWxkT3B0aW9uc19FZGl0aW9uRGVmYXVsdFNjaGVtYSA9IC8qQF9fUFVSRV9fKi8gbWVzc2FnZURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMTIsIDApO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLkZpZWxkT3B0aW9ucy5GZWF0dXJlU3VwcG9ydC5cbiAqIFVzZSBgY3JlYXRlKEZpZWxkT3B0aW9uc19GZWF0dXJlU3VwcG9ydFNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgRmllbGRPcHRpb25zX0ZlYXR1cmVTdXBwb3J0U2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAxMiwgMSk7XG4vKipcbiAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5GaWVsZE9wdGlvbnMuQ1R5cGVcbiAqL1xuZXhwb3J0IHZhciBGaWVsZE9wdGlvbnNfQ1R5cGU7XG4oZnVuY3Rpb24gKEZpZWxkT3B0aW9uc19DVHlwZSkge1xuICAgIC8qKlxuICAgICAqIERlZmF1bHQgbW9kZS5cbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBTVFJJTkcgPSAwO1xuICAgICAqL1xuICAgIEZpZWxkT3B0aW9uc19DVHlwZVtGaWVsZE9wdGlvbnNfQ1R5cGVbXCJTVFJJTkdcIl0gPSAwXSA9IFwiU1RSSU5HXCI7XG4gICAgLyoqXG4gICAgICogVGhlIG9wdGlvbiBbY3R5cGU9Q09SRF0gbWF5IGJlIGFwcGxpZWQgdG8gYSBub24tcmVwZWF0ZWQgZmllbGQgb2YgdHlwZVxuICAgICAqIFwiYnl0ZXNcIi4gSXQgaW5kaWNhdGVzIHRoYXQgaW4gQysrLCB0aGUgZGF0YSBzaG91bGQgYmUgc3RvcmVkIGluIGEgQ29yZFxuICAgICAqIGluc3RlYWQgb2YgYSBzdHJpbmcuICBGb3IgdmVyeSBsYXJnZSBzdHJpbmdzLCB0aGlzIG1heSByZWR1Y2UgbWVtb3J5XG4gICAgICogZnJhZ21lbnRhdGlvbi4gSXQgbWF5IGFsc28gYWxsb3cgYmV0dGVyIHBlcmZvcm1hbmNlIHdoZW4gcGFyc2luZyBmcm9tIGFcbiAgICAgKiBDb3JkLCBvciB3aGVuIHBhcnNpbmcgd2l0aCBhbGlhc2luZyBlbmFibGVkLCBhcyB0aGUgcGFyc2VkIENvcmQgbWF5IHRoZW5cbiAgICAgKiBhbGlhcyB0aGUgb3JpZ2luYWwgYnVmZmVyLlxuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IENPUkQgPSAxO1xuICAgICAqL1xuICAgIEZpZWxkT3B0aW9uc19DVHlwZVtGaWVsZE9wdGlvbnNfQ1R5cGVbXCJDT1JEXCJdID0gMV0gPSBcIkNPUkRcIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogU1RSSU5HX1BJRUNFID0gMjtcbiAgICAgKi9cbiAgICBGaWVsZE9wdGlvbnNfQ1R5cGVbRmllbGRPcHRpb25zX0NUeXBlW1wiU1RSSU5HX1BJRUNFXCJdID0gMl0gPSBcIlNUUklOR19QSUVDRVwiO1xufSkoRmllbGRPcHRpb25zX0NUeXBlIHx8IChGaWVsZE9wdGlvbnNfQ1R5cGUgPSB7fSkpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIGVudW0gZ29vZ2xlLnByb3RvYnVmLkZpZWxkT3B0aW9ucy5DVHlwZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEZpZWxkT3B0aW9uc19DVHlwZVNjaGVtYSA9IC8qQF9fUFVSRV9fKi8gZW51bURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMTIsIDApO1xuLyoqXG4gKiBAZ2VuZXJhdGVkIGZyb20gZW51bSBnb29nbGUucHJvdG9idWYuRmllbGRPcHRpb25zLkpTVHlwZVxuICovXG5leHBvcnQgdmFyIEZpZWxkT3B0aW9uc19KU1R5cGU7XG4oZnVuY3Rpb24gKEZpZWxkT3B0aW9uc19KU1R5cGUpIHtcbiAgICAvKipcbiAgICAgKiBVc2UgdGhlIGRlZmF1bHQgdHlwZS5cbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBKU19OT1JNQUwgPSAwO1xuICAgICAqL1xuICAgIEZpZWxkT3B0aW9uc19KU1R5cGVbRmllbGRPcHRpb25zX0pTVHlwZVtcIkpTX05PUk1BTFwiXSA9IDBdID0gXCJKU19OT1JNQUxcIjtcbiAgICAvKipcbiAgICAgKiBVc2UgSmF2YVNjcmlwdCBzdHJpbmdzLlxuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IEpTX1NUUklORyA9IDE7XG4gICAgICovXG4gICAgRmllbGRPcHRpb25zX0pTVHlwZVtGaWVsZE9wdGlvbnNfSlNUeXBlW1wiSlNfU1RSSU5HXCJdID0gMV0gPSBcIkpTX1NUUklOR1wiO1xuICAgIC8qKlxuICAgICAqIFVzZSBKYXZhU2NyaXB0IG51bWJlcnMuXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogSlNfTlVNQkVSID0gMjtcbiAgICAgKi9cbiAgICBGaWVsZE9wdGlvbnNfSlNUeXBlW0ZpZWxkT3B0aW9uc19KU1R5cGVbXCJKU19OVU1CRVJcIl0gPSAyXSA9IFwiSlNfTlVNQkVSXCI7XG59KShGaWVsZE9wdGlvbnNfSlNUeXBlIHx8IChGaWVsZE9wdGlvbnNfSlNUeXBlID0ge30pKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5GaWVsZE9wdGlvbnMuSlNUeXBlLlxuICovXG5leHBvcnQgY29uc3QgRmllbGRPcHRpb25zX0pTVHlwZVNjaGVtYSA9IC8qQF9fUFVSRV9fKi8gZW51bURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMTIsIDEpO1xuLyoqXG4gKiBJZiBzZXQgdG8gUkVURU5USU9OX1NPVVJDRSwgdGhlIG9wdGlvbiB3aWxsIGJlIG9taXR0ZWQgZnJvbSB0aGUgYmluYXJ5LlxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5GaWVsZE9wdGlvbnMuT3B0aW9uUmV0ZW50aW9uXG4gKi9cbmV4cG9ydCB2YXIgRmllbGRPcHRpb25zX09wdGlvblJldGVudGlvbjtcbihmdW5jdGlvbiAoRmllbGRPcHRpb25zX09wdGlvblJldGVudGlvbikge1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBSRVRFTlRJT05fVU5LTk9XTiA9IDA7XG4gICAgICovXG4gICAgRmllbGRPcHRpb25zX09wdGlvblJldGVudGlvbltGaWVsZE9wdGlvbnNfT3B0aW9uUmV0ZW50aW9uW1wiUkVURU5USU9OX1VOS05PV05cIl0gPSAwXSA9IFwiUkVURU5USU9OX1VOS05PV05cIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogUkVURU5USU9OX1JVTlRJTUUgPSAxO1xuICAgICAqL1xuICAgIEZpZWxkT3B0aW9uc19PcHRpb25SZXRlbnRpb25bRmllbGRPcHRpb25zX09wdGlvblJldGVudGlvbltcIlJFVEVOVElPTl9SVU5USU1FXCJdID0gMV0gPSBcIlJFVEVOVElPTl9SVU5USU1FXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFJFVEVOVElPTl9TT1VSQ0UgPSAyO1xuICAgICAqL1xuICAgIEZpZWxkT3B0aW9uc19PcHRpb25SZXRlbnRpb25bRmllbGRPcHRpb25zX09wdGlvblJldGVudGlvbltcIlJFVEVOVElPTl9TT1VSQ0VcIl0gPSAyXSA9IFwiUkVURU5USU9OX1NPVVJDRVwiO1xufSkoRmllbGRPcHRpb25zX09wdGlvblJldGVudGlvbiB8fCAoRmllbGRPcHRpb25zX09wdGlvblJldGVudGlvbiA9IHt9KSk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgZW51bSBnb29nbGUucHJvdG9idWYuRmllbGRPcHRpb25zLk9wdGlvblJldGVudGlvbi5cbiAqL1xuZXhwb3J0IGNvbnN0IEZpZWxkT3B0aW9uc19PcHRpb25SZXRlbnRpb25TY2hlbWEgPSAvKkBfX1BVUkVfXyovIGVudW1EZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDEyLCAyKTtcbi8qKlxuICogVGhpcyBpbmRpY2F0ZXMgdGhlIHR5cGVzIG9mIGVudGl0aWVzIHRoYXQgdGhlIGZpZWxkIG1heSBhcHBseSB0byB3aGVuIHVzZWRcbiAqIGFzIGFuIG9wdGlvbi4gSWYgaXQgaXMgdW5zZXQsIHRoZW4gdGhlIGZpZWxkIG1heSBiZSBmcmVlbHkgdXNlZCBhcyBhblxuICogb3B0aW9uIG9uIGFueSBraW5kIG9mIGVudGl0eS5cbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gZW51bSBnb29nbGUucHJvdG9idWYuRmllbGRPcHRpb25zLk9wdGlvblRhcmdldFR5cGVcbiAqL1xuZXhwb3J0IHZhciBGaWVsZE9wdGlvbnNfT3B0aW9uVGFyZ2V0VHlwZTtcbihmdW5jdGlvbiAoRmllbGRPcHRpb25zX09wdGlvblRhcmdldFR5cGUpIHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVEFSR0VUX1RZUEVfVU5LTk9XTiA9IDA7XG4gICAgICovXG4gICAgRmllbGRPcHRpb25zX09wdGlvblRhcmdldFR5cGVbRmllbGRPcHRpb25zX09wdGlvblRhcmdldFR5cGVbXCJUQVJHRVRfVFlQRV9VTktOT1dOXCJdID0gMF0gPSBcIlRBUkdFVF9UWVBFX1VOS05PV05cIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVEFSR0VUX1RZUEVfRklMRSA9IDE7XG4gICAgICovXG4gICAgRmllbGRPcHRpb25zX09wdGlvblRhcmdldFR5cGVbRmllbGRPcHRpb25zX09wdGlvblRhcmdldFR5cGVbXCJUQVJHRVRfVFlQRV9GSUxFXCJdID0gMV0gPSBcIlRBUkdFVF9UWVBFX0ZJTEVcIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVEFSR0VUX1RZUEVfRVhURU5TSU9OX1JBTkdFID0gMjtcbiAgICAgKi9cbiAgICBGaWVsZE9wdGlvbnNfT3B0aW9uVGFyZ2V0VHlwZVtGaWVsZE9wdGlvbnNfT3B0aW9uVGFyZ2V0VHlwZVtcIlRBUkdFVF9UWVBFX0VYVEVOU0lPTl9SQU5HRVwiXSA9IDJdID0gXCJUQVJHRVRfVFlQRV9FWFRFTlNJT05fUkFOR0VcIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVEFSR0VUX1RZUEVfTUVTU0FHRSA9IDM7XG4gICAgICovXG4gICAgRmllbGRPcHRpb25zX09wdGlvblRhcmdldFR5cGVbRmllbGRPcHRpb25zX09wdGlvblRhcmdldFR5cGVbXCJUQVJHRVRfVFlQRV9NRVNTQUdFXCJdID0gM10gPSBcIlRBUkdFVF9UWVBFX01FU1NBR0VcIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVEFSR0VUX1RZUEVfRklFTEQgPSA0O1xuICAgICAqL1xuICAgIEZpZWxkT3B0aW9uc19PcHRpb25UYXJnZXRUeXBlW0ZpZWxkT3B0aW9uc19PcHRpb25UYXJnZXRUeXBlW1wiVEFSR0VUX1RZUEVfRklFTERcIl0gPSA0XSA9IFwiVEFSR0VUX1RZUEVfRklFTERcIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVEFSR0VUX1RZUEVfT05FT0YgPSA1O1xuICAgICAqL1xuICAgIEZpZWxkT3B0aW9uc19PcHRpb25UYXJnZXRUeXBlW0ZpZWxkT3B0aW9uc19PcHRpb25UYXJnZXRUeXBlW1wiVEFSR0VUX1RZUEVfT05FT0ZcIl0gPSA1XSA9IFwiVEFSR0VUX1RZUEVfT05FT0ZcIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVEFSR0VUX1RZUEVfRU5VTSA9IDY7XG4gICAgICovXG4gICAgRmllbGRPcHRpb25zX09wdGlvblRhcmdldFR5cGVbRmllbGRPcHRpb25zX09wdGlvblRhcmdldFR5cGVbXCJUQVJHRVRfVFlQRV9FTlVNXCJdID0gNl0gPSBcIlRBUkdFVF9UWVBFX0VOVU1cIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVEFSR0VUX1RZUEVfRU5VTV9FTlRSWSA9IDc7XG4gICAgICovXG4gICAgRmllbGRPcHRpb25zX09wdGlvblRhcmdldFR5cGVbRmllbGRPcHRpb25zX09wdGlvblRhcmdldFR5cGVbXCJUQVJHRVRfVFlQRV9FTlVNX0VOVFJZXCJdID0gN10gPSBcIlRBUkdFVF9UWVBFX0VOVU1fRU5UUllcIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVEFSR0VUX1RZUEVfU0VSVklDRSA9IDg7XG4gICAgICovXG4gICAgRmllbGRPcHRpb25zX09wdGlvblRhcmdldFR5cGVbRmllbGRPcHRpb25zX09wdGlvblRhcmdldFR5cGVbXCJUQVJHRVRfVFlQRV9TRVJWSUNFXCJdID0gOF0gPSBcIlRBUkdFVF9UWVBFX1NFUlZJQ0VcIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVEFSR0VUX1RZUEVfTUVUSE9EID0gOTtcbiAgICAgKi9cbiAgICBGaWVsZE9wdGlvbnNfT3B0aW9uVGFyZ2V0VHlwZVtGaWVsZE9wdGlvbnNfT3B0aW9uVGFyZ2V0VHlwZVtcIlRBUkdFVF9UWVBFX01FVEhPRFwiXSA9IDldID0gXCJUQVJHRVRfVFlQRV9NRVRIT0RcIjtcbn0pKEZpZWxkT3B0aW9uc19PcHRpb25UYXJnZXRUeXBlIHx8IChGaWVsZE9wdGlvbnNfT3B0aW9uVGFyZ2V0VHlwZSA9IHt9KSk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgZW51bSBnb29nbGUucHJvdG9idWYuRmllbGRPcHRpb25zLk9wdGlvblRhcmdldFR5cGUuXG4gKi9cbmV4cG9ydCBjb25zdCBGaWVsZE9wdGlvbnNfT3B0aW9uVGFyZ2V0VHlwZVNjaGVtYSA9IC8qQF9fUFVSRV9fKi8gZW51bURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMTIsIDMpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLk9uZW9mT3B0aW9ucy5cbiAqIFVzZSBgY3JlYXRlKE9uZW9mT3B0aW9uc1NjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgT25lb2ZPcHRpb25zU2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAxMyk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBnb29nbGUucHJvdG9idWYuRW51bU9wdGlvbnMuXG4gKiBVc2UgYGNyZWF0ZShFbnVtT3B0aW9uc1NjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgRW51bU9wdGlvbnNTY2hlbWEgPSAvKkBfX1BVUkVfXyovIG1lc3NhZ2VEZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDE0KTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5FbnVtVmFsdWVPcHRpb25zLlxuICogVXNlIGBjcmVhdGUoRW51bVZhbHVlT3B0aW9uc1NjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgRW51bVZhbHVlT3B0aW9uc1NjaGVtYSA9IC8qQF9fUFVSRV9fKi8gbWVzc2FnZURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMTUpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLlNlcnZpY2VPcHRpb25zLlxuICogVXNlIGBjcmVhdGUoU2VydmljZU9wdGlvbnNTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IFNlcnZpY2VPcHRpb25zU2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAxNik7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBnb29nbGUucHJvdG9idWYuTWV0aG9kT3B0aW9ucy5cbiAqIFVzZSBgY3JlYXRlKE1ldGhvZE9wdGlvbnNTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IE1ldGhvZE9wdGlvbnNTY2hlbWEgPSAvKkBfX1BVUkVfXyovIG1lc3NhZ2VEZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDE3KTtcbi8qKlxuICogSXMgdGhpcyBtZXRob2Qgc2lkZS1lZmZlY3QtZnJlZSAob3Igc2FmZSBpbiBIVFRQIHBhcmxhbmNlKSwgb3IgaWRlbXBvdGVudCxcbiAqIG9yIG5laXRoZXI/IEhUVFAgYmFzZWQgUlBDIGltcGxlbWVudGF0aW9uIG1heSBjaG9vc2UgR0VUIHZlcmIgZm9yIHNhZmVcbiAqIG1ldGhvZHMsIGFuZCBQVVQgdmVyYiBmb3IgaWRlbXBvdGVudCBtZXRob2RzIGluc3RlYWQgb2YgdGhlIGRlZmF1bHQgUE9TVC5cbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gZW51bSBnb29nbGUucHJvdG9idWYuTWV0aG9kT3B0aW9ucy5JZGVtcG90ZW5jeUxldmVsXG4gKi9cbmV4cG9ydCB2YXIgTWV0aG9kT3B0aW9uc19JZGVtcG90ZW5jeUxldmVsO1xuKGZ1bmN0aW9uIChNZXRob2RPcHRpb25zX0lkZW1wb3RlbmN5TGV2ZWwpIHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogSURFTVBPVEVOQ1lfVU5LTk9XTiA9IDA7XG4gICAgICovXG4gICAgTWV0aG9kT3B0aW9uc19JZGVtcG90ZW5jeUxldmVsW01ldGhvZE9wdGlvbnNfSWRlbXBvdGVuY3lMZXZlbFtcIklERU1QT1RFTkNZX1VOS05PV05cIl0gPSAwXSA9IFwiSURFTVBPVEVOQ1lfVU5LTk9XTlwiO1xuICAgIC8qKlxuICAgICAqIGltcGxpZXMgaWRlbXBvdGVudFxuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IE5PX1NJREVfRUZGRUNUUyA9IDE7XG4gICAgICovXG4gICAgTWV0aG9kT3B0aW9uc19JZGVtcG90ZW5jeUxldmVsW01ldGhvZE9wdGlvbnNfSWRlbXBvdGVuY3lMZXZlbFtcIk5PX1NJREVfRUZGRUNUU1wiXSA9IDFdID0gXCJOT19TSURFX0VGRkVDVFNcIjtcbiAgICAvKipcbiAgICAgKiBpZGVtcG90ZW50LCBidXQgbWF5IGhhdmUgc2lkZSBlZmZlY3RzXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogSURFTVBPVEVOVCA9IDI7XG4gICAgICovXG4gICAgTWV0aG9kT3B0aW9uc19JZGVtcG90ZW5jeUxldmVsW01ldGhvZE9wdGlvbnNfSWRlbXBvdGVuY3lMZXZlbFtcIklERU1QT1RFTlRcIl0gPSAyXSA9IFwiSURFTVBPVEVOVFwiO1xufSkoTWV0aG9kT3B0aW9uc19JZGVtcG90ZW5jeUxldmVsIHx8IChNZXRob2RPcHRpb25zX0lkZW1wb3RlbmN5TGV2ZWwgPSB7fSkpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIGVudW0gZ29vZ2xlLnByb3RvYnVmLk1ldGhvZE9wdGlvbnMuSWRlbXBvdGVuY3lMZXZlbC5cbiAqL1xuZXhwb3J0IGNvbnN0IE1ldGhvZE9wdGlvbnNfSWRlbXBvdGVuY3lMZXZlbFNjaGVtYSA9IC8qQF9fUFVSRV9fKi8gZW51bURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMTcsIDApO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLlVuaW50ZXJwcmV0ZWRPcHRpb24uXG4gKiBVc2UgYGNyZWF0ZShVbmludGVycHJldGVkT3B0aW9uU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBVbmludGVycHJldGVkT3B0aW9uU2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAxOCk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBnb29nbGUucHJvdG9idWYuVW5pbnRlcnByZXRlZE9wdGlvbi5OYW1lUGFydC5cbiAqIFVzZSBgY3JlYXRlKFVuaW50ZXJwcmV0ZWRPcHRpb25fTmFtZVBhcnRTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IFVuaW50ZXJwcmV0ZWRPcHRpb25fTmFtZVBhcnRTY2hlbWEgPSAvKkBfX1BVUkVfXyovIG1lc3NhZ2VEZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDE4LCAwKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LlxuICogVXNlIGBjcmVhdGUoRmVhdHVyZVNldFNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgRmVhdHVyZVNldFNjaGVtYSA9IC8qQF9fUFVSRV9fKi8gbWVzc2FnZURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMTkpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXQuVmlzaWJpbGl0eUZlYXR1cmUuXG4gKiBVc2UgYGNyZWF0ZShGZWF0dXJlU2V0X1Zpc2liaWxpdHlGZWF0dXJlU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBGZWF0dXJlU2V0X1Zpc2liaWxpdHlGZWF0dXJlU2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAxOSwgMCk7XG4vKipcbiAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LlZpc2liaWxpdHlGZWF0dXJlLkRlZmF1bHRTeW1ib2xWaXNpYmlsaXR5XG4gKi9cbmV4cG9ydCB2YXIgRmVhdHVyZVNldF9WaXNpYmlsaXR5RmVhdHVyZV9EZWZhdWx0U3ltYm9sVmlzaWJpbGl0eTtcbihmdW5jdGlvbiAoRmVhdHVyZVNldF9WaXNpYmlsaXR5RmVhdHVyZV9EZWZhdWx0U3ltYm9sVmlzaWJpbGl0eSkge1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBERUZBVUxUX1NZTUJPTF9WSVNJQklMSVRZX1VOS05PV04gPSAwO1xuICAgICAqL1xuICAgIEZlYXR1cmVTZXRfVmlzaWJpbGl0eUZlYXR1cmVfRGVmYXVsdFN5bWJvbFZpc2liaWxpdHlbRmVhdHVyZVNldF9WaXNpYmlsaXR5RmVhdHVyZV9EZWZhdWx0U3ltYm9sVmlzaWJpbGl0eVtcIkRFRkFVTFRfU1lNQk9MX1ZJU0lCSUxJVFlfVU5LTk9XTlwiXSA9IDBdID0gXCJERUZBVUxUX1NZTUJPTF9WSVNJQklMSVRZX1VOS05PV05cIjtcbiAgICAvKipcbiAgICAgKiBEZWZhdWx0IHByZS1FRElUSU9OXzIwMjQsIGFsbCBVTlNFVCB2aXNpYmlsaXR5IGFyZSBleHBvcnQuXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogRVhQT1JUX0FMTCA9IDE7XG4gICAgICovXG4gICAgRmVhdHVyZVNldF9WaXNpYmlsaXR5RmVhdHVyZV9EZWZhdWx0U3ltYm9sVmlzaWJpbGl0eVtGZWF0dXJlU2V0X1Zpc2liaWxpdHlGZWF0dXJlX0RlZmF1bHRTeW1ib2xWaXNpYmlsaXR5W1wiRVhQT1JUX0FMTFwiXSA9IDFdID0gXCJFWFBPUlRfQUxMXCI7XG4gICAgLyoqXG4gICAgICogQWxsIHRvcC1sZXZlbCBzeW1ib2xzIGRlZmF1bHQgdG8gZXhwb3J0LCBuZXN0ZWQgZGVmYXVsdCB0byBsb2NhbC5cbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBFWFBPUlRfVE9QX0xFVkVMID0gMjtcbiAgICAgKi9cbiAgICBGZWF0dXJlU2V0X1Zpc2liaWxpdHlGZWF0dXJlX0RlZmF1bHRTeW1ib2xWaXNpYmlsaXR5W0ZlYXR1cmVTZXRfVmlzaWJpbGl0eUZlYXR1cmVfRGVmYXVsdFN5bWJvbFZpc2liaWxpdHlbXCJFWFBPUlRfVE9QX0xFVkVMXCJdID0gMl0gPSBcIkVYUE9SVF9UT1BfTEVWRUxcIjtcbiAgICAvKipcbiAgICAgKiBBbGwgc3ltYm9scyBkZWZhdWx0IHRvIGxvY2FsLlxuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IExPQ0FMX0FMTCA9IDM7XG4gICAgICovXG4gICAgRmVhdHVyZVNldF9WaXNpYmlsaXR5RmVhdHVyZV9EZWZhdWx0U3ltYm9sVmlzaWJpbGl0eVtGZWF0dXJlU2V0X1Zpc2liaWxpdHlGZWF0dXJlX0RlZmF1bHRTeW1ib2xWaXNpYmlsaXR5W1wiTE9DQUxfQUxMXCJdID0gM10gPSBcIkxPQ0FMX0FMTFwiO1xuICAgIC8qKlxuICAgICAqIEFsbCBzeW1ib2xzIGxvY2FsIGJ5IGRlZmF1bHQuIE5lc3RlZCB0eXBlcyBjYW5ub3QgYmUgZXhwb3J0ZWQuXG4gICAgICogV2l0aCBzcGVjaWFsIGNhc2UgY2F2ZWF0IGZvciBtZXNzYWdlIHsgZW51bSB7fSByZXNlcnZlZCAxIHRvIG1heDsgfVxuICAgICAqIFRoaXMgaXMgdGhlIHJlY29tbWVuZGVkIHNldHRpbmcgZm9yIG5ldyBwcm90b3MuXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogU1RSSUNUID0gNDtcbiAgICAgKi9cbiAgICBGZWF0dXJlU2V0X1Zpc2liaWxpdHlGZWF0dXJlX0RlZmF1bHRTeW1ib2xWaXNpYmlsaXR5W0ZlYXR1cmVTZXRfVmlzaWJpbGl0eUZlYXR1cmVfRGVmYXVsdFN5bWJvbFZpc2liaWxpdHlbXCJTVFJJQ1RcIl0gPSA0XSA9IFwiU1RSSUNUXCI7XG59KShGZWF0dXJlU2V0X1Zpc2liaWxpdHlGZWF0dXJlX0RlZmF1bHRTeW1ib2xWaXNpYmlsaXR5IHx8IChGZWF0dXJlU2V0X1Zpc2liaWxpdHlGZWF0dXJlX0RlZmF1bHRTeW1ib2xWaXNpYmlsaXR5ID0ge30pKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LlZpc2liaWxpdHlGZWF0dXJlLkRlZmF1bHRTeW1ib2xWaXNpYmlsaXR5LlxuICovXG5leHBvcnQgY29uc3QgRmVhdHVyZVNldF9WaXNpYmlsaXR5RmVhdHVyZV9EZWZhdWx0U3ltYm9sVmlzaWJpbGl0eVNjaGVtYSA9IC8qQF9fUFVSRV9fKi8gZW51bURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMTksIDAsIDApO1xuLyoqXG4gKiBAZ2VuZXJhdGVkIGZyb20gZW51bSBnb29nbGUucHJvdG9idWYuRmVhdHVyZVNldC5GaWVsZFByZXNlbmNlXG4gKi9cbmV4cG9ydCB2YXIgRmVhdHVyZVNldF9GaWVsZFByZXNlbmNlO1xuKGZ1bmN0aW9uIChGZWF0dXJlU2V0X0ZpZWxkUHJlc2VuY2UpIHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogRklFTERfUFJFU0VOQ0VfVU5LTk9XTiA9IDA7XG4gICAgICovXG4gICAgRmVhdHVyZVNldF9GaWVsZFByZXNlbmNlW0ZlYXR1cmVTZXRfRmllbGRQcmVzZW5jZVtcIkZJRUxEX1BSRVNFTkNFX1VOS05PV05cIl0gPSAwXSA9IFwiRklFTERfUFJFU0VOQ0VfVU5LTk9XTlwiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBFWFBMSUNJVCA9IDE7XG4gICAgICovXG4gICAgRmVhdHVyZVNldF9GaWVsZFByZXNlbmNlW0ZlYXR1cmVTZXRfRmllbGRQcmVzZW5jZVtcIkVYUExJQ0lUXCJdID0gMV0gPSBcIkVYUExJQ0lUXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IElNUExJQ0lUID0gMjtcbiAgICAgKi9cbiAgICBGZWF0dXJlU2V0X0ZpZWxkUHJlc2VuY2VbRmVhdHVyZVNldF9GaWVsZFByZXNlbmNlW1wiSU1QTElDSVRcIl0gPSAyXSA9IFwiSU1QTElDSVRcIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogTEVHQUNZX1JFUVVJUkVEID0gMztcbiAgICAgKi9cbiAgICBGZWF0dXJlU2V0X0ZpZWxkUHJlc2VuY2VbRmVhdHVyZVNldF9GaWVsZFByZXNlbmNlW1wiTEVHQUNZX1JFUVVJUkVEXCJdID0gM10gPSBcIkxFR0FDWV9SRVFVSVJFRFwiO1xufSkoRmVhdHVyZVNldF9GaWVsZFByZXNlbmNlIHx8IChGZWF0dXJlU2V0X0ZpZWxkUHJlc2VuY2UgPSB7fSkpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIGVudW0gZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXQuRmllbGRQcmVzZW5jZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEZlYXR1cmVTZXRfRmllbGRQcmVzZW5jZVNjaGVtYSA9IC8qQF9fUFVSRV9fKi8gZW51bURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMTksIDApO1xuLyoqXG4gKiBAZ2VuZXJhdGVkIGZyb20gZW51bSBnb29nbGUucHJvdG9idWYuRmVhdHVyZVNldC5FbnVtVHlwZVxuICovXG5leHBvcnQgdmFyIEZlYXR1cmVTZXRfRW51bVR5cGU7XG4oZnVuY3Rpb24gKEZlYXR1cmVTZXRfRW51bVR5cGUpIHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogRU5VTV9UWVBFX1VOS05PV04gPSAwO1xuICAgICAqL1xuICAgIEZlYXR1cmVTZXRfRW51bVR5cGVbRmVhdHVyZVNldF9FbnVtVHlwZVtcIkVOVU1fVFlQRV9VTktOT1dOXCJdID0gMF0gPSBcIkVOVU1fVFlQRV9VTktOT1dOXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IE9QRU4gPSAxO1xuICAgICAqL1xuICAgIEZlYXR1cmVTZXRfRW51bVR5cGVbRmVhdHVyZVNldF9FbnVtVHlwZVtcIk9QRU5cIl0gPSAxXSA9IFwiT1BFTlwiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBDTE9TRUQgPSAyO1xuICAgICAqL1xuICAgIEZlYXR1cmVTZXRfRW51bVR5cGVbRmVhdHVyZVNldF9FbnVtVHlwZVtcIkNMT1NFRFwiXSA9IDJdID0gXCJDTE9TRURcIjtcbn0pKEZlYXR1cmVTZXRfRW51bVR5cGUgfHwgKEZlYXR1cmVTZXRfRW51bVR5cGUgPSB7fSkpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIGVudW0gZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXQuRW51bVR5cGUuXG4gKi9cbmV4cG9ydCBjb25zdCBGZWF0dXJlU2V0X0VudW1UeXBlU2NoZW1hID0gLypAX19QVVJFX18qLyBlbnVtRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAxOSwgMSk7XG4vKipcbiAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LlJlcGVhdGVkRmllbGRFbmNvZGluZ1xuICovXG5leHBvcnQgdmFyIEZlYXR1cmVTZXRfUmVwZWF0ZWRGaWVsZEVuY29kaW5nO1xuKGZ1bmN0aW9uIChGZWF0dXJlU2V0X1JlcGVhdGVkRmllbGRFbmNvZGluZykge1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBSRVBFQVRFRF9GSUVMRF9FTkNPRElOR19VTktOT1dOID0gMDtcbiAgICAgKi9cbiAgICBGZWF0dXJlU2V0X1JlcGVhdGVkRmllbGRFbmNvZGluZ1tGZWF0dXJlU2V0X1JlcGVhdGVkRmllbGRFbmNvZGluZ1tcIlJFUEVBVEVEX0ZJRUxEX0VOQ09ESU5HX1VOS05PV05cIl0gPSAwXSA9IFwiUkVQRUFURURfRklFTERfRU5DT0RJTkdfVU5LTk9XTlwiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBQQUNLRUQgPSAxO1xuICAgICAqL1xuICAgIEZlYXR1cmVTZXRfUmVwZWF0ZWRGaWVsZEVuY29kaW5nW0ZlYXR1cmVTZXRfUmVwZWF0ZWRGaWVsZEVuY29kaW5nW1wiUEFDS0VEXCJdID0gMV0gPSBcIlBBQ0tFRFwiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBFWFBBTkRFRCA9IDI7XG4gICAgICovXG4gICAgRmVhdHVyZVNldF9SZXBlYXRlZEZpZWxkRW5jb2RpbmdbRmVhdHVyZVNldF9SZXBlYXRlZEZpZWxkRW5jb2RpbmdbXCJFWFBBTkRFRFwiXSA9IDJdID0gXCJFWFBBTkRFRFwiO1xufSkoRmVhdHVyZVNldF9SZXBlYXRlZEZpZWxkRW5jb2RpbmcgfHwgKEZlYXR1cmVTZXRfUmVwZWF0ZWRGaWVsZEVuY29kaW5nID0ge30pKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LlJlcGVhdGVkRmllbGRFbmNvZGluZy5cbiAqL1xuZXhwb3J0IGNvbnN0IEZlYXR1cmVTZXRfUmVwZWF0ZWRGaWVsZEVuY29kaW5nU2NoZW1hID0gLypAX19QVVJFX18qLyBlbnVtRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAxOSwgMik7XG4vKipcbiAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LlV0ZjhWYWxpZGF0aW9uXG4gKi9cbmV4cG9ydCB2YXIgRmVhdHVyZVNldF9VdGY4VmFsaWRhdGlvbjtcbihmdW5jdGlvbiAoRmVhdHVyZVNldF9VdGY4VmFsaWRhdGlvbikge1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBVVEY4X1ZBTElEQVRJT05fVU5LTk9XTiA9IDA7XG4gICAgICovXG4gICAgRmVhdHVyZVNldF9VdGY4VmFsaWRhdGlvbltGZWF0dXJlU2V0X1V0ZjhWYWxpZGF0aW9uW1wiVVRGOF9WQUxJREFUSU9OX1VOS05PV05cIl0gPSAwXSA9IFwiVVRGOF9WQUxJREFUSU9OX1VOS05PV05cIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVkVSSUZZID0gMjtcbiAgICAgKi9cbiAgICBGZWF0dXJlU2V0X1V0ZjhWYWxpZGF0aW9uW0ZlYXR1cmVTZXRfVXRmOFZhbGlkYXRpb25bXCJWRVJJRllcIl0gPSAyXSA9IFwiVkVSSUZZXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IE5PTkUgPSAzO1xuICAgICAqL1xuICAgIEZlYXR1cmVTZXRfVXRmOFZhbGlkYXRpb25bRmVhdHVyZVNldF9VdGY4VmFsaWRhdGlvbltcIk5PTkVcIl0gPSAzXSA9IFwiTk9ORVwiO1xufSkoRmVhdHVyZVNldF9VdGY4VmFsaWRhdGlvbiB8fCAoRmVhdHVyZVNldF9VdGY4VmFsaWRhdGlvbiA9IHt9KSk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgZW51bSBnb29nbGUucHJvdG9idWYuRmVhdHVyZVNldC5VdGY4VmFsaWRhdGlvbi5cbiAqL1xuZXhwb3J0IGNvbnN0IEZlYXR1cmVTZXRfVXRmOFZhbGlkYXRpb25TY2hlbWEgPSAvKkBfX1BVUkVfXyovIGVudW1EZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDE5LCAzKTtcbi8qKlxuICogQGdlbmVyYXRlZCBmcm9tIGVudW0gZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXQuTWVzc2FnZUVuY29kaW5nXG4gKi9cbmV4cG9ydCB2YXIgRmVhdHVyZVNldF9NZXNzYWdlRW5jb2Rpbmc7XG4oZnVuY3Rpb24gKEZlYXR1cmVTZXRfTWVzc2FnZUVuY29kaW5nKSB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IE1FU1NBR0VfRU5DT0RJTkdfVU5LTk9XTiA9IDA7XG4gICAgICovXG4gICAgRmVhdHVyZVNldF9NZXNzYWdlRW5jb2RpbmdbRmVhdHVyZVNldF9NZXNzYWdlRW5jb2RpbmdbXCJNRVNTQUdFX0VOQ09ESU5HX1VOS05PV05cIl0gPSAwXSA9IFwiTUVTU0FHRV9FTkNPRElOR19VTktOT1dOXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IExFTkdUSF9QUkVGSVhFRCA9IDE7XG4gICAgICovXG4gICAgRmVhdHVyZVNldF9NZXNzYWdlRW5jb2RpbmdbRmVhdHVyZVNldF9NZXNzYWdlRW5jb2RpbmdbXCJMRU5HVEhfUFJFRklYRURcIl0gPSAxXSA9IFwiTEVOR1RIX1BSRUZJWEVEXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IERFTElNSVRFRCA9IDI7XG4gICAgICovXG4gICAgRmVhdHVyZVNldF9NZXNzYWdlRW5jb2RpbmdbRmVhdHVyZVNldF9NZXNzYWdlRW5jb2RpbmdbXCJERUxJTUlURURcIl0gPSAyXSA9IFwiREVMSU1JVEVEXCI7XG59KShGZWF0dXJlU2V0X01lc3NhZ2VFbmNvZGluZyB8fCAoRmVhdHVyZVNldF9NZXNzYWdlRW5jb2RpbmcgPSB7fSkpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIGVudW0gZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXQuTWVzc2FnZUVuY29kaW5nLlxuICovXG5leHBvcnQgY29uc3QgRmVhdHVyZVNldF9NZXNzYWdlRW5jb2RpbmdTY2hlbWEgPSAvKkBfX1BVUkVfXyovIGVudW1EZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDE5LCA0KTtcbi8qKlxuICogQGdlbmVyYXRlZCBmcm9tIGVudW0gZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXQuSnNvbkZvcm1hdFxuICovXG5leHBvcnQgdmFyIEZlYXR1cmVTZXRfSnNvbkZvcm1hdDtcbihmdW5jdGlvbiAoRmVhdHVyZVNldF9Kc29uRm9ybWF0KSB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IEpTT05fRk9STUFUX1VOS05PV04gPSAwO1xuICAgICAqL1xuICAgIEZlYXR1cmVTZXRfSnNvbkZvcm1hdFtGZWF0dXJlU2V0X0pzb25Gb3JtYXRbXCJKU09OX0ZPUk1BVF9VTktOT1dOXCJdID0gMF0gPSBcIkpTT05fRk9STUFUX1VOS05PV05cIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogQUxMT1cgPSAxO1xuICAgICAqL1xuICAgIEZlYXR1cmVTZXRfSnNvbkZvcm1hdFtGZWF0dXJlU2V0X0pzb25Gb3JtYXRbXCJBTExPV1wiXSA9IDFdID0gXCJBTExPV1wiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBMRUdBQ1lfQkVTVF9FRkZPUlQgPSAyO1xuICAgICAqL1xuICAgIEZlYXR1cmVTZXRfSnNvbkZvcm1hdFtGZWF0dXJlU2V0X0pzb25Gb3JtYXRbXCJMRUdBQ1lfQkVTVF9FRkZPUlRcIl0gPSAyXSA9IFwiTEVHQUNZX0JFU1RfRUZGT1JUXCI7XG59KShGZWF0dXJlU2V0X0pzb25Gb3JtYXQgfHwgKEZlYXR1cmVTZXRfSnNvbkZvcm1hdCA9IHt9KSk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgZW51bSBnb29nbGUucHJvdG9idWYuRmVhdHVyZVNldC5Kc29uRm9ybWF0LlxuICovXG5leHBvcnQgY29uc3QgRmVhdHVyZVNldF9Kc29uRm9ybWF0U2NoZW1hID0gLypAX19QVVJFX18qLyBlbnVtRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAxOSwgNSk7XG4vKipcbiAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LkVuZm9yY2VOYW1pbmdTdHlsZVxuICovXG5leHBvcnQgdmFyIEZlYXR1cmVTZXRfRW5mb3JjZU5hbWluZ1N0eWxlO1xuKGZ1bmN0aW9uIChGZWF0dXJlU2V0X0VuZm9yY2VOYW1pbmdTdHlsZSkge1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBFTkZPUkNFX05BTUlOR19TVFlMRV9VTktOT1dOID0gMDtcbiAgICAgKi9cbiAgICBGZWF0dXJlU2V0X0VuZm9yY2VOYW1pbmdTdHlsZVtGZWF0dXJlU2V0X0VuZm9yY2VOYW1pbmdTdHlsZVtcIkVORk9SQ0VfTkFNSU5HX1NUWUxFX1VOS05PV05cIl0gPSAwXSA9IFwiRU5GT1JDRV9OQU1JTkdfU1RZTEVfVU5LTk9XTlwiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBTVFlMRTIwMjQgPSAxO1xuICAgICAqL1xuICAgIEZlYXR1cmVTZXRfRW5mb3JjZU5hbWluZ1N0eWxlW0ZlYXR1cmVTZXRfRW5mb3JjZU5hbWluZ1N0eWxlW1wiU1RZTEUyMDI0XCJdID0gMV0gPSBcIlNUWUxFMjAyNFwiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBTVFlMRV9MRUdBQ1kgPSAyO1xuICAgICAqL1xuICAgIEZlYXR1cmVTZXRfRW5mb3JjZU5hbWluZ1N0eWxlW0ZlYXR1cmVTZXRfRW5mb3JjZU5hbWluZ1N0eWxlW1wiU1RZTEVfTEVHQUNZXCJdID0gMl0gPSBcIlNUWUxFX0xFR0FDWVwiO1xufSkoRmVhdHVyZVNldF9FbmZvcmNlTmFtaW5nU3R5bGUgfHwgKEZlYXR1cmVTZXRfRW5mb3JjZU5hbWluZ1N0eWxlID0ge30pKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LkVuZm9yY2VOYW1pbmdTdHlsZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEZlYXR1cmVTZXRfRW5mb3JjZU5hbWluZ1N0eWxlU2NoZW1hID0gLypAX19QVVJFX18qLyBlbnVtRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAxOSwgNik7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBnb29nbGUucHJvdG9idWYuRmVhdHVyZVNldERlZmF1bHRzLlxuICogVXNlIGBjcmVhdGUoRmVhdHVyZVNldERlZmF1bHRzU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBGZWF0dXJlU2V0RGVmYXVsdHNTY2hlbWEgPSAvKkBfX1BVUkVfXyovIG1lc3NhZ2VEZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDIwKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0RGVmYXVsdHMuRmVhdHVyZVNldEVkaXRpb25EZWZhdWx0LlxuICogVXNlIGBjcmVhdGUoRmVhdHVyZVNldERlZmF1bHRzX0ZlYXR1cmVTZXRFZGl0aW9uRGVmYXVsdFNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgRmVhdHVyZVNldERlZmF1bHRzX0ZlYXR1cmVTZXRFZGl0aW9uRGVmYXVsdFNjaGVtYSA9IC8qQF9fUFVSRV9fKi8gbWVzc2FnZURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMjAsIDApO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLlNvdXJjZUNvZGVJbmZvLlxuICogVXNlIGBjcmVhdGUoU291cmNlQ29kZUluZm9TY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IFNvdXJjZUNvZGVJbmZvU2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAyMSk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBnb29nbGUucHJvdG9idWYuU291cmNlQ29kZUluZm8uTG9jYXRpb24uXG4gKiBVc2UgYGNyZWF0ZShTb3VyY2VDb2RlSW5mb19Mb2NhdGlvblNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgU291cmNlQ29kZUluZm9fTG9jYXRpb25TY2hlbWEgPSAvKkBfX1BVUkVfXyovIG1lc3NhZ2VEZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDIxLCAwKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5HZW5lcmF0ZWRDb2RlSW5mby5cbiAqIFVzZSBgY3JlYXRlKEdlbmVyYXRlZENvZGVJbmZvU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBHZW5lcmF0ZWRDb2RlSW5mb1NjaGVtYSA9IC8qQF9fUFVSRV9fKi8gbWVzc2FnZURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMjIpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLkdlbmVyYXRlZENvZGVJbmZvLkFubm90YXRpb24uXG4gKiBVc2UgYGNyZWF0ZShHZW5lcmF0ZWRDb2RlSW5mb19Bbm5vdGF0aW9uU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBHZW5lcmF0ZWRDb2RlSW5mb19Bbm5vdGF0aW9uU2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAyMiwgMCk7XG4vKipcbiAqIFJlcHJlc2VudHMgdGhlIGlkZW50aWZpZWQgb2JqZWN0J3MgZWZmZWN0IG9uIHRoZSBlbGVtZW50IGluIHRoZSBvcmlnaW5hbFxuICogLnByb3RvIGZpbGUuXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIGVudW0gZ29vZ2xlLnByb3RvYnVmLkdlbmVyYXRlZENvZGVJbmZvLkFubm90YXRpb24uU2VtYW50aWNcbiAqL1xuZXhwb3J0IHZhciBHZW5lcmF0ZWRDb2RlSW5mb19Bbm5vdGF0aW9uX1NlbWFudGljO1xuKGZ1bmN0aW9uIChHZW5lcmF0ZWRDb2RlSW5mb19Bbm5vdGF0aW9uX1NlbWFudGljKSB7XG4gICAgLyoqXG4gICAgICogVGhlcmUgaXMgbm8gZWZmZWN0IG9yIHRoZSBlZmZlY3QgaXMgaW5kZXNjcmliYWJsZS5cbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBOT05FID0gMDtcbiAgICAgKi9cbiAgICBHZW5lcmF0ZWRDb2RlSW5mb19Bbm5vdGF0aW9uX1NlbWFudGljW0dlbmVyYXRlZENvZGVJbmZvX0Fubm90YXRpb25fU2VtYW50aWNbXCJOT05FXCJdID0gMF0gPSBcIk5PTkVcIjtcbiAgICAvKipcbiAgICAgKiBUaGUgZWxlbWVudCBpcyBzZXQgb3Igb3RoZXJ3aXNlIG11dGF0ZWQuXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogU0VUID0gMTtcbiAgICAgKi9cbiAgICBHZW5lcmF0ZWRDb2RlSW5mb19Bbm5vdGF0aW9uX1NlbWFudGljW0dlbmVyYXRlZENvZGVJbmZvX0Fubm90YXRpb25fU2VtYW50aWNbXCJTRVRcIl0gPSAxXSA9IFwiU0VUXCI7XG4gICAgLyoqXG4gICAgICogQW4gYWxpYXMgdG8gdGhlIGVsZW1lbnQgaXMgcmV0dXJuZWQuXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogQUxJQVMgPSAyO1xuICAgICAqL1xuICAgIEdlbmVyYXRlZENvZGVJbmZvX0Fubm90YXRpb25fU2VtYW50aWNbR2VuZXJhdGVkQ29kZUluZm9fQW5ub3RhdGlvbl9TZW1hbnRpY1tcIkFMSUFTXCJdID0gMl0gPSBcIkFMSUFTXCI7XG59KShHZW5lcmF0ZWRDb2RlSW5mb19Bbm5vdGF0aW9uX1NlbWFudGljIHx8IChHZW5lcmF0ZWRDb2RlSW5mb19Bbm5vdGF0aW9uX1NlbWFudGljID0ge30pKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5HZW5lcmF0ZWRDb2RlSW5mby5Bbm5vdGF0aW9uLlNlbWFudGljLlxuICovXG5leHBvcnQgY29uc3QgR2VuZXJhdGVkQ29kZUluZm9fQW5ub3RhdGlvbl9TZW1hbnRpY1NjaGVtYSA9IC8qQF9fUFVSRV9fKi8gZW51bURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMjIsIDAsIDApO1xuLyoqXG4gKiBUaGUgZnVsbCBzZXQgb2Yga25vd24gZWRpdGlvbnMuXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIGVudW0gZ29vZ2xlLnByb3RvYnVmLkVkaXRpb25cbiAqL1xuZXhwb3J0IHZhciBFZGl0aW9uO1xuKGZ1bmN0aW9uIChFZGl0aW9uKSB7XG4gICAgLyoqXG4gICAgICogQSBwbGFjZWhvbGRlciBmb3IgYW4gdW5rbm93biBlZGl0aW9uIHZhbHVlLlxuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IEVESVRJT05fVU5LTk9XTiA9IDA7XG4gICAgICovXG4gICAgRWRpdGlvbltFZGl0aW9uW1wiRURJVElPTl9VTktOT1dOXCJdID0gMF0gPSBcIkVESVRJT05fVU5LTk9XTlwiO1xuICAgIC8qKlxuICAgICAqIEEgcGxhY2Vob2xkZXIgZWRpdGlvbiBmb3Igc3BlY2lmeWluZyBkZWZhdWx0IGJlaGF2aW9ycyAqYmVmb3JlKiBhIGZlYXR1cmVcbiAgICAgKiB3YXMgZmlyc3QgaW50cm9kdWNlZC4gIFRoaXMgaXMgZWZmZWN0aXZlbHkgYW4gXCJpbmZpbml0ZSBwYXN0XCIuXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogRURJVElPTl9MRUdBQ1kgPSA5MDA7XG4gICAgICovXG4gICAgRWRpdGlvbltFZGl0aW9uW1wiRURJVElPTl9MRUdBQ1lcIl0gPSA5MDBdID0gXCJFRElUSU9OX0xFR0FDWVwiO1xuICAgIC8qKlxuICAgICAqIExlZ2FjeSBzeW50YXggXCJlZGl0aW9uc1wiLiAgVGhlc2UgcHJlLWRhdGUgZWRpdGlvbnMsIGJ1dCBiZWhhdmUgbXVjaCBsaWtlXG4gICAgICogZGlzdGluY3QgZWRpdGlvbnMuICBUaGVzZSBjYW4ndCBiZSB1c2VkIHRvIHNwZWNpZnkgdGhlIGVkaXRpb24gb2YgcHJvdG9cbiAgICAgKiBmaWxlcywgYnV0IGZlYXR1cmUgZGVmaW5pdGlvbnMgbXVzdCBzdXBwbHkgcHJvdG8yL3Byb3RvMyBkZWZhdWx0cyBmb3JcbiAgICAgKiBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eS5cbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBFRElUSU9OX1BST1RPMiA9IDk5ODtcbiAgICAgKi9cbiAgICBFZGl0aW9uW0VkaXRpb25bXCJFRElUSU9OX1BST1RPMlwiXSA9IDk5OF0gPSBcIkVESVRJT05fUFJPVE8yXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IEVESVRJT05fUFJPVE8zID0gOTk5O1xuICAgICAqL1xuICAgIEVkaXRpb25bRWRpdGlvbltcIkVESVRJT05fUFJPVE8zXCJdID0gOTk5XSA9IFwiRURJVElPTl9QUk9UTzNcIjtcbiAgICAvKipcbiAgICAgKiBFZGl0aW9ucyB0aGF0IGhhdmUgYmVlbiByZWxlYXNlZC4gIFRoZSBzcGVjaWZpYyB2YWx1ZXMgYXJlIGFyYml0cmFyeSBhbmRcbiAgICAgKiBzaG91bGQgbm90IGJlIGRlcGVuZGVkIG9uLCBidXQgdGhleSB3aWxsIGFsd2F5cyBiZSB0aW1lLW9yZGVyZWQgZm9yIGVhc3lcbiAgICAgKiBjb21wYXJpc29uLlxuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IEVESVRJT05fMjAyMyA9IDEwMDA7XG4gICAgICovXG4gICAgRWRpdGlvbltFZGl0aW9uW1wiRURJVElPTl8yMDIzXCJdID0gMTAwMF0gPSBcIkVESVRJT05fMjAyM1wiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBFRElUSU9OXzIwMjQgPSAxMDAxO1xuICAgICAqL1xuICAgIEVkaXRpb25bRWRpdGlvbltcIkVESVRJT05fMjAyNFwiXSA9IDEwMDFdID0gXCJFRElUSU9OXzIwMjRcIjtcbiAgICAvKipcbiAgICAgKiBQbGFjZWhvbGRlciBlZGl0aW9ucyBmb3IgdGVzdGluZyBmZWF0dXJlIHJlc29sdXRpb24uICBUaGVzZSBzaG91bGQgbm90IGJlXG4gICAgICogdXNlZCBvciByZWxpZWQgb24gb3V0c2lkZSBvZiB0ZXN0cy5cbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBFRElUSU9OXzFfVEVTVF9PTkxZID0gMTtcbiAgICAgKi9cbiAgICBFZGl0aW9uW0VkaXRpb25bXCJFRElUSU9OXzFfVEVTVF9PTkxZXCJdID0gMV0gPSBcIkVESVRJT05fMV9URVNUX09OTFlcIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogRURJVElPTl8yX1RFU1RfT05MWSA9IDI7XG4gICAgICovXG4gICAgRWRpdGlvbltFZGl0aW9uW1wiRURJVElPTl8yX1RFU1RfT05MWVwiXSA9IDJdID0gXCJFRElUSU9OXzJfVEVTVF9PTkxZXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IEVESVRJT05fOTk5OTdfVEVTVF9PTkxZID0gOTk5OTc7XG4gICAgICovXG4gICAgRWRpdGlvbltFZGl0aW9uW1wiRURJVElPTl85OTk5N19URVNUX09OTFlcIl0gPSA5OTk5N10gPSBcIkVESVRJT05fOTk5OTdfVEVTVF9PTkxZXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IEVESVRJT05fOTk5OThfVEVTVF9PTkxZID0gOTk5OTg7XG4gICAgICovXG4gICAgRWRpdGlvbltFZGl0aW9uW1wiRURJVElPTl85OTk5OF9URVNUX09OTFlcIl0gPSA5OTk5OF0gPSBcIkVESVRJT05fOTk5OThfVEVTVF9PTkxZXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IEVESVRJT05fOTk5OTlfVEVTVF9PTkxZID0gOTk5OTk7XG4gICAgICovXG4gICAgRWRpdGlvbltFZGl0aW9uW1wiRURJVElPTl85OTk5OV9URVNUX09OTFlcIl0gPSA5OTk5OV0gPSBcIkVESVRJT05fOTk5OTlfVEVTVF9PTkxZXCI7XG4gICAgLyoqXG4gICAgICogUGxhY2Vob2xkZXIgZm9yIHNwZWNpZnlpbmcgdW5ib3VuZGVkIGVkaXRpb24gc3VwcG9ydC4gIFRoaXMgc2hvdWxkIG9ubHlcbiAgICAgKiBldmVyIGJlIHVzZWQgYnkgcGx1Z2lucyB0aGF0IGNhbiBleHBlY3QgdG8gbmV2ZXIgcmVxdWlyZSBhbnkgY2hhbmdlcyB0b1xuICAgICAqIHN1cHBvcnQgYSBuZXcgZWRpdGlvbi5cbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBFRElUSU9OX01BWCA9IDIxNDc0ODM2NDc7XG4gICAgICovXG4gICAgRWRpdGlvbltFZGl0aW9uW1wiRURJVElPTl9NQVhcIl0gPSAyMTQ3NDgzNjQ3XSA9IFwiRURJVElPTl9NQVhcIjtcbn0pKEVkaXRpb24gfHwgKEVkaXRpb24gPSB7fSkpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIGVudW0gZ29vZ2xlLnByb3RvYnVmLkVkaXRpb24uXG4gKi9cbmV4cG9ydCBjb25zdCBFZGl0aW9uU2NoZW1hID0gLypAX19QVVJFX18qLyBlbnVtRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAwKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSAndmlzaWJpbGl0eScgb2YgYSBzeW1ib2wgd2l0aCByZXNwZWN0IHRvIHRoZSBwcm90byBpbXBvcnRcbiAqIHN5c3RlbS4gU3ltYm9scyBjYW4gb25seSBiZSBpbXBvcnRlZCB3aGVuIHRoZSB2aXNpYmlsaXR5IHJ1bGVzIGRvIG5vdCBwcmV2ZW50XG4gKiBpdCAoZXg6IGxvY2FsIHN5bWJvbHMgY2Fubm90IGJlIGltcG9ydGVkKS4gIFZpc2liaWxpdHkgbW9kaWZpZXJzIGNhbiBvbmx5IHNldFxuICogb24gYG1lc3NhZ2VgIGFuZCBgZW51bWAgYXMgdGhleSBhcmUgdGhlIG9ubHkgdHlwZXMgYXZhaWxhYmxlIHRvIGJlIHJlZmVyZW5jZWRcbiAqIGZyb20gb3RoZXIgZmlsZXMuXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIGVudW0gZ29vZ2xlLnByb3RvYnVmLlN5bWJvbFZpc2liaWxpdHlcbiAqL1xuZXhwb3J0IHZhciBTeW1ib2xWaXNpYmlsaXR5O1xuKGZ1bmN0aW9uIChTeW1ib2xWaXNpYmlsaXR5KSB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFZJU0lCSUxJVFlfVU5TRVQgPSAwO1xuICAgICAqL1xuICAgIFN5bWJvbFZpc2liaWxpdHlbU3ltYm9sVmlzaWJpbGl0eVtcIlZJU0lCSUxJVFlfVU5TRVRcIl0gPSAwXSA9IFwiVklTSUJJTElUWV9VTlNFVFwiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBWSVNJQklMSVRZX0xPQ0FMID0gMTtcbiAgICAgKi9cbiAgICBTeW1ib2xWaXNpYmlsaXR5W1N5bWJvbFZpc2liaWxpdHlbXCJWSVNJQklMSVRZX0xPQ0FMXCJdID0gMV0gPSBcIlZJU0lCSUxJVFlfTE9DQUxcIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVklTSUJJTElUWV9FWFBPUlQgPSAyO1xuICAgICAqL1xuICAgIFN5bWJvbFZpc2liaWxpdHlbU3ltYm9sVmlzaWJpbGl0eVtcIlZJU0lCSUxJVFlfRVhQT1JUXCJdID0gMl0gPSBcIlZJU0lCSUxJVFlfRVhQT1JUXCI7XG59KShTeW1ib2xWaXNpYmlsaXR5IHx8IChTeW1ib2xWaXNpYmlsaXR5ID0ge30pKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5TeW1ib2xWaXNpYmlsaXR5LlxuICovXG5leHBvcnQgY29uc3QgU3ltYm9sVmlzaWJpbGl0eVNjaGVtYSA9IC8qQF9fUFVSRV9fKi8gZW51bURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMSk7XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbmltcG9ydCB7IFNjYWxhclR5cGUgfSBmcm9tIFwiLi9kZXNjcmlwdG9ycy5qc1wiO1xuaW1wb3J0IHsgc2NhbGFyWmVyb1ZhbHVlIH0gZnJvbSBcIi4vcmVmbGVjdC9zY2FsYXIuanNcIjtcbmltcG9ydCB7IHJlZmxlY3QgfSBmcm9tIFwiLi9yZWZsZWN0L3JlZmxlY3QuanNcIjtcbmltcG9ydCB7IEJpbmFyeVJlYWRlciwgV2lyZVR5cGUgfSBmcm9tIFwiLi93aXJlL2JpbmFyeS1lbmNvZGluZy5qc1wiO1xuaW1wb3J0IHsgdmFyaW50MzJ3cml0ZSB9IGZyb20gXCIuL3dpcmUvdmFyaW50LmpzXCI7XG4vLyBEZWZhdWx0IG9wdGlvbnMgZm9yIHBhcnNpbmcgYmluYXJ5IGRhdGEuXG5jb25zdCByZWFkRGVmYXVsdHMgPSB7XG4gICAgcmVhZFVua25vd25GaWVsZHM6IHRydWUsXG59O1xuZnVuY3Rpb24gbWFrZVJlYWRPcHRpb25zKG9wdGlvbnMpIHtcbiAgICByZXR1cm4gb3B0aW9ucyA/IE9iamVjdC5hc3NpZ24oT2JqZWN0LmFzc2lnbih7fSwgcmVhZERlZmF1bHRzKSwgb3B0aW9ucykgOiByZWFkRGVmYXVsdHM7XG59XG4vKipcbiAqIFBhcnNlIHNlcmlhbGl6ZWQgYmluYXJ5IGRhdGEuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmcm9tQmluYXJ5KHNjaGVtYSwgYnl0ZXMsIG9wdGlvbnMpIHtcbiAgICBjb25zdCBtc2cgPSByZWZsZWN0KHNjaGVtYSwgdW5kZWZpbmVkLCBmYWxzZSk7XG4gICAgcmVhZE1lc3NhZ2UobXNnLCBuZXcgQmluYXJ5UmVhZGVyKGJ5dGVzKSwgbWFrZVJlYWRPcHRpb25zKG9wdGlvbnMpLCBmYWxzZSwgYnl0ZXMuYnl0ZUxlbmd0aCk7XG4gICAgcmV0dXJuIG1zZy5tZXNzYWdlO1xufVxuLyoqXG4gKiBQYXJzZSBmcm9tIGJpbmFyeSBkYXRhLCBtZXJnaW5nIGZpZWxkcy5cbiAqXG4gKiBSZXBlYXRlZCBmaWVsZHMgYXJlIGFwcGVuZGVkLiBNYXAgZW50cmllcyBhcmUgYWRkZWQsIG92ZXJ3cml0aW5nXG4gKiBleGlzdGluZyBrZXlzLlxuICpcbiAqIElmIGEgbWVzc2FnZSBmaWVsZCBpcyBhbHJlYWR5IHByZXNlbnQsIGl0IHdpbGwgYmUgbWVyZ2VkIHdpdGggdGhlXG4gKiBuZXcgZGF0YS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1lcmdlRnJvbUJpbmFyeShzY2hlbWEsIHRhcmdldCwgYnl0ZXMsIG9wdGlvbnMpIHtcbiAgICByZWFkTWVzc2FnZShyZWZsZWN0KHNjaGVtYSwgdGFyZ2V0LCBmYWxzZSksIG5ldyBCaW5hcnlSZWFkZXIoYnl0ZXMpLCBtYWtlUmVhZE9wdGlvbnMob3B0aW9ucyksIGZhbHNlLCBieXRlcy5ieXRlTGVuZ3RoKTtcbiAgICByZXR1cm4gdGFyZ2V0O1xufVxuLyoqXG4gKiBJZiBgZGVsaW1pdGVkYCBpcyBmYWxzZSwgcmVhZCB0aGUgbGVuZ3RoIGdpdmVuIGluIGBsZW5ndGhPckRlbGltaXRlZEZpZWxkTm9gLlxuICpcbiAqIElmIGBkZWxpbWl0ZWRgIGlzIHRydWUsIHJlYWQgdW50aWwgYW4gRW5kR3JvdXAgdGFnLiBgbGVuZ3RoT3JEZWxpbWl0ZWRGaWVsZE5vYFxuICogaXMgdGhlIGV4cGVjdGVkIGZpZWxkIG51bWJlci5cbiAqXG4gKiBAcHJpdmF0ZVxuICovXG5mdW5jdGlvbiByZWFkTWVzc2FnZShtZXNzYWdlLCByZWFkZXIsIG9wdGlvbnMsIGRlbGltaXRlZCwgbGVuZ3RoT3JEZWxpbWl0ZWRGaWVsZE5vKSB7XG4gICAgdmFyIF9hO1xuICAgIGNvbnN0IGVuZCA9IGRlbGltaXRlZCA/IHJlYWRlci5sZW4gOiByZWFkZXIucG9zICsgbGVuZ3RoT3JEZWxpbWl0ZWRGaWVsZE5vO1xuICAgIGxldCBmaWVsZE5vO1xuICAgIGxldCB3aXJlVHlwZTtcbiAgICBjb25zdCB1bmtub3duRmllbGRzID0gKF9hID0gbWVzc2FnZS5nZXRVbmtub3duKCkpICE9PSBudWxsICYmIF9hICE9PSB2b2lkIDAgPyBfYSA6IFtdO1xuICAgIHdoaWxlIChyZWFkZXIucG9zIDwgZW5kKSB7XG4gICAgICAgIFtmaWVsZE5vLCB3aXJlVHlwZV0gPSByZWFkZXIudGFnKCk7XG4gICAgICAgIGlmIChkZWxpbWl0ZWQgJiYgd2lyZVR5cGUgPT0gV2lyZVR5cGUuRW5kR3JvdXApIHtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGZpZWxkID0gbWVzc2FnZS5maW5kTnVtYmVyKGZpZWxkTm8pO1xuICAgICAgICBpZiAoIWZpZWxkKSB7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0gcmVhZGVyLnNraXAod2lyZVR5cGUsIGZpZWxkTm8pO1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMucmVhZFVua25vd25GaWVsZHMpIHtcbiAgICAgICAgICAgICAgICB1bmtub3duRmllbGRzLnB1c2goeyBubzogZmllbGRObywgd2lyZVR5cGUsIGRhdGEgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICByZWFkRmllbGQobWVzc2FnZSwgcmVhZGVyLCBmaWVsZCwgd2lyZVR5cGUsIG9wdGlvbnMpO1xuICAgIH1cbiAgICBpZiAoZGVsaW1pdGVkKSB7XG4gICAgICAgIGlmICh3aXJlVHlwZSAhPSBXaXJlVHlwZS5FbmRHcm91cCB8fCBmaWVsZE5vICE9PSBsZW5ndGhPckRlbGltaXRlZEZpZWxkTm8pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImludmFsaWQgZW5kIGdyb3VwIHRhZ1wiKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAodW5rbm93bkZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIG1lc3NhZ2Uuc2V0VW5rbm93bih1bmtub3duRmllbGRzKTtcbiAgICB9XG59XG4vKipcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWFkRmllbGQobWVzc2FnZSwgcmVhZGVyLCBmaWVsZCwgd2lyZVR5cGUsIG9wdGlvbnMpIHtcbiAgICB2YXIgX2E7XG4gICAgc3dpdGNoIChmaWVsZC5maWVsZEtpbmQpIHtcbiAgICAgICAgY2FzZSBcInNjYWxhclwiOlxuICAgICAgICAgICAgbWVzc2FnZS5zZXQoZmllbGQsIHJlYWRTY2FsYXIocmVhZGVyLCBmaWVsZC5zY2FsYXIpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiZW51bVwiOlxuICAgICAgICAgICAgY29uc3QgdmFsID0gcmVhZFNjYWxhcihyZWFkZXIsIFNjYWxhclR5cGUuSU5UMzIpO1xuICAgICAgICAgICAgaWYgKGZpZWxkLmVudW0ub3Blbikge1xuICAgICAgICAgICAgICAgIG1lc3NhZ2Uuc2V0KGZpZWxkLCB2YWwpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgb2sgPSBmaWVsZC5lbnVtLnZhbHVlcy5zb21lKCh2KSA9PiB2Lm51bWJlciA9PT0gdmFsKTtcbiAgICAgICAgICAgICAgICBpZiAob2spIHtcbiAgICAgICAgICAgICAgICAgICAgbWVzc2FnZS5zZXQoZmllbGQsIHZhbCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKG9wdGlvbnMucmVhZFVua25vd25GaWVsZHMpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYnl0ZXMgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgdmFyaW50MzJ3cml0ZSh2YWwsIGJ5dGVzKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdW5rbm93bkZpZWxkcyA9IChfYSA9IG1lc3NhZ2UuZ2V0VW5rbm93bigpKSAhPT0gbnVsbCAmJiBfYSAhPT0gdm9pZCAwID8gX2EgOiBbXTtcbiAgICAgICAgICAgICAgICAgICAgdW5rbm93bkZpZWxkcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vOiBmaWVsZC5udW1iZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICB3aXJlVHlwZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRhdGE6IG5ldyBVaW50OEFycmF5KGJ5dGVzKSxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2Uuc2V0VW5rbm93bih1bmtub3duRmllbGRzKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIm1lc3NhZ2VcIjpcbiAgICAgICAgICAgIG1lc3NhZ2Uuc2V0KGZpZWxkLCByZWFkTWVzc2FnZUZpZWxkKHJlYWRlciwgb3B0aW9ucywgZmllbGQsIG1lc3NhZ2UuZ2V0KGZpZWxkKSkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJsaXN0XCI6XG4gICAgICAgICAgICByZWFkTGlzdEZpZWxkKHJlYWRlciwgd2lyZVR5cGUsIG1lc3NhZ2UuZ2V0KGZpZWxkKSwgb3B0aW9ucyk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIm1hcFwiOlxuICAgICAgICAgICAgcmVhZE1hcEVudHJ5KHJlYWRlciwgbWVzc2FnZS5nZXQoZmllbGQpLCBvcHRpb25zKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgIH1cbn1cbi8vIFJlYWQgYSBtYXAgZmllbGQsIGV4cGVjdGluZyBrZXkgZmllbGQgPSAxLCB2YWx1ZSBmaWVsZCA9IDJcbmZ1bmN0aW9uIHJlYWRNYXBFbnRyeShyZWFkZXIsIG1hcCwgb3B0aW9ucykge1xuICAgIGNvbnN0IGZpZWxkID0gbWFwLmZpZWxkKCk7XG4gICAgbGV0IGtleTtcbiAgICBsZXQgdmFsO1xuICAgIC8vIFJlYWQgdGhlIGxlbmd0aCBvZiB0aGUgbWFwIGVudHJ5LCB3aGljaCBpcyBhIHZhcmludC5cbiAgICBjb25zdCBsZW4gPSByZWFkZXIudWludDMyKCk7XG4gICAgLy8gV0FSTklORzogQ2FsY3VsYXRlIGVuZCBBRlRFUiBhZHZhbmNpbmcgcmVhZGVyLnBvcyAoYWJvdmUpLCBzbyB0aGF0XG4gICAgLy8gICAgICAgICAgcmVhZGVyLnBvcyBpcyBhdCB0aGUgc3RhcnQgb2YgdGhlIG1hcCBlbnRyeS5cbiAgICBjb25zdCBlbmQgPSByZWFkZXIucG9zICsgbGVuO1xuICAgIHdoaWxlIChyZWFkZXIucG9zIDwgZW5kKSB7XG4gICAgICAgIGNvbnN0IFtmaWVsZE5vXSA9IHJlYWRlci50YWcoKTtcbiAgICAgICAgc3dpdGNoIChmaWVsZE5vKSB7XG4gICAgICAgICAgICBjYXNlIDE6XG4gICAgICAgICAgICAgICAga2V5ID0gcmVhZFNjYWxhcihyZWFkZXIsIGZpZWxkLm1hcEtleSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDI6XG4gICAgICAgICAgICAgICAgc3dpdGNoIChmaWVsZC5tYXBLaW5kKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJzY2FsYXJcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHJlYWRTY2FsYXIocmVhZGVyLCBmaWVsZC5zY2FsYXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJlbnVtXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSByZWFkZXIuaW50MzIoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIFwibWVzc2FnZVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gcmVhZE1lc3NhZ2VGaWVsZChyZWFkZXIsIG9wdGlvbnMsIGZpZWxkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoa2V5ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAga2V5ID0gc2NhbGFyWmVyb1ZhbHVlKGZpZWxkLm1hcEtleSwgZmFsc2UpO1xuICAgIH1cbiAgICBpZiAodmFsID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgc3dpdGNoIChmaWVsZC5tYXBLaW5kKSB7XG4gICAgICAgICAgICBjYXNlIFwic2NhbGFyXCI6XG4gICAgICAgICAgICAgICAgdmFsID0gc2NhbGFyWmVyb1ZhbHVlKGZpZWxkLnNjYWxhciwgZmFsc2UpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcImVudW1cIjpcbiAgICAgICAgICAgICAgICB2YWwgPSBmaWVsZC5lbnVtLnZhbHVlc1swXS5udW1iZXI7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwibWVzc2FnZVwiOlxuICAgICAgICAgICAgICAgIHZhbCA9IHJlZmxlY3QoZmllbGQubWVzc2FnZSwgdW5kZWZpbmVkLCBmYWxzZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG4gICAgbWFwLnNldChrZXksIHZhbCk7XG59XG5mdW5jdGlvbiByZWFkTGlzdEZpZWxkKHJlYWRlciwgd2lyZVR5cGUsIGxpc3QsIG9wdGlvbnMpIHtcbiAgICB2YXIgX2E7XG4gICAgY29uc3QgZmllbGQgPSBsaXN0LmZpZWxkKCk7XG4gICAgaWYgKGZpZWxkLmxpc3RLaW5kID09PSBcIm1lc3NhZ2VcIikge1xuICAgICAgICBsaXN0LmFkZChyZWFkTWVzc2FnZUZpZWxkKHJlYWRlciwgb3B0aW9ucywgZmllbGQpKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBzY2FsYXJUeXBlID0gKF9hID0gZmllbGQuc2NhbGFyKSAhPT0gbnVsbCAmJiBfYSAhPT0gdm9pZCAwID8gX2EgOiBTY2FsYXJUeXBlLklOVDMyO1xuICAgIGNvbnN0IHBhY2tlZCA9IHdpcmVUeXBlID09IFdpcmVUeXBlLkxlbmd0aERlbGltaXRlZCAmJlxuICAgICAgICBzY2FsYXJUeXBlICE9IFNjYWxhclR5cGUuU1RSSU5HICYmXG4gICAgICAgIHNjYWxhclR5cGUgIT0gU2NhbGFyVHlwZS5CWVRFUztcbiAgICBpZiAoIXBhY2tlZCkge1xuICAgICAgICBsaXN0LmFkZChyZWFkU2NhbGFyKHJlYWRlciwgc2NhbGFyVHlwZSkpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGUgPSByZWFkZXIudWludDMyKCkgKyByZWFkZXIucG9zO1xuICAgIHdoaWxlIChyZWFkZXIucG9zIDwgZSkge1xuICAgICAgICBsaXN0LmFkZChyZWFkU2NhbGFyKHJlYWRlciwgc2NhbGFyVHlwZSkpO1xuICAgIH1cbn1cbmZ1bmN0aW9uIHJlYWRNZXNzYWdlRmllbGQocmVhZGVyLCBvcHRpb25zLCBmaWVsZCwgbWVyZ2VNZXNzYWdlKSB7XG4gICAgY29uc3QgZGVsaW1pdGVkID0gZmllbGQuZGVsaW1pdGVkRW5jb2Rpbmc7XG4gICAgY29uc3QgbWVzc2FnZSA9IG1lcmdlTWVzc2FnZSAhPT0gbnVsbCAmJiBtZXJnZU1lc3NhZ2UgIT09IHZvaWQgMCA/IG1lcmdlTWVzc2FnZSA6IHJlZmxlY3QoZmllbGQubWVzc2FnZSwgdW5kZWZpbmVkLCBmYWxzZSk7XG4gICAgcmVhZE1lc3NhZ2UobWVzc2FnZSwgcmVhZGVyLCBvcHRpb25zLCBkZWxpbWl0ZWQsIGRlbGltaXRlZCA/IGZpZWxkLm51bWJlciA6IHJlYWRlci51aW50MzIoKSk7XG4gICAgcmV0dXJuIG1lc3NhZ2U7XG59XG5mdW5jdGlvbiByZWFkU2NhbGFyKHJlYWRlciwgdHlwZSkge1xuICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU1RSSU5HOlxuICAgICAgICAgICAgcmV0dXJuIHJlYWRlci5zdHJpbmcoKTtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkJPT0w6XG4gICAgICAgICAgICByZXR1cm4gcmVhZGVyLmJvb2woKTtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkRPVUJMRTpcbiAgICAgICAgICAgIHJldHVybiByZWFkZXIuZG91YmxlKCk7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5GTE9BVDpcbiAgICAgICAgICAgIHJldHVybiByZWFkZXIuZmxvYXQoKTtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLklOVDMyOlxuICAgICAgICAgICAgcmV0dXJuIHJlYWRlci5pbnQzMigpO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuSU5UNjQ6XG4gICAgICAgICAgICByZXR1cm4gcmVhZGVyLmludDY0KCk7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5VSU5UNjQ6XG4gICAgICAgICAgICByZXR1cm4gcmVhZGVyLnVpbnQ2NCgpO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRklYRUQ2NDpcbiAgICAgICAgICAgIHJldHVybiByZWFkZXIuZml4ZWQ2NCgpO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuQllURVM6XG4gICAgICAgICAgICByZXR1cm4gcmVhZGVyLmJ5dGVzKCk7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5GSVhFRDMyOlxuICAgICAgICAgICAgcmV0dXJuIHJlYWRlci5maXhlZDMyKCk7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TRklYRUQzMjpcbiAgICAgICAgICAgIHJldHVybiByZWFkZXIuc2ZpeGVkMzIoKTtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNGSVhFRDY0OlxuICAgICAgICAgICAgcmV0dXJuIHJlYWRlci5zZml4ZWQ2NCgpO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0lOVDY0OlxuICAgICAgICAgICAgcmV0dXJuIHJlYWRlci5zaW50NjQoKTtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlVJTlQzMjpcbiAgICAgICAgICAgIHJldHVybiByZWFkZXIudWludDMyKCk7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TSU5UMzI6XG4gICAgICAgICAgICByZXR1cm4gcmVhZGVyLnNpbnQzMigpO1xuICAgIH1cbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuaW1wb3J0IHsgYmFzZTY0RGVjb2RlIH0gZnJvbSBcIi4uL3dpcmUvYmFzZTY0LWVuY29kaW5nLmpzXCI7XG5pbXBvcnQgeyBGaWxlRGVzY3JpcHRvclByb3RvU2NoZW1hIH0gZnJvbSBcIi4uL3drdC9nZW4vZ29vZ2xlL3Byb3RvYnVmL2Rlc2NyaXB0b3JfcGIuanNcIjtcbmltcG9ydCB7IGNyZWF0ZUZpbGVSZWdpc3RyeSB9IGZyb20gXCIuLi9yZWdpc3RyeS5qc1wiO1xuaW1wb3J0IHsgcmVzdG9yZUpzb25OYW1lcyB9IGZyb20gXCIuL3Jlc3RvcmUtanNvbi1uYW1lcy5qc1wiO1xuaW1wb3J0IHsgZnJvbUJpbmFyeSB9IGZyb20gXCIuLi9mcm9tLWJpbmFyeS5qc1wiO1xuLyoqXG4gKiBIeWRyYXRlIGEgZmlsZSBkZXNjcmlwdG9yLlxuICpcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaWxlRGVzYyhiNjQsIGltcG9ydHMpIHtcbiAgICB2YXIgX2E7XG4gICAgY29uc3Qgcm9vdCA9IGZyb21CaW5hcnkoRmlsZURlc2NyaXB0b3JQcm90b1NjaGVtYSwgYmFzZTY0RGVjb2RlKGI2NCkpO1xuICAgIHJvb3QubWVzc2FnZVR5cGUuZm9yRWFjaChyZXN0b3JlSnNvbk5hbWVzKTtcbiAgICByb290LmRlcGVuZGVuY3kgPSAoX2EgPSBpbXBvcnRzID09PSBudWxsIHx8IGltcG9ydHMgPT09IHZvaWQgMCA/IHZvaWQgMCA6IGltcG9ydHMubWFwKChmKSA9PiBmLnByb3RvLm5hbWUpKSAhPT0gbnVsbCAmJiBfYSAhPT0gdm9pZCAwID8gX2EgOiBbXTtcbiAgICBjb25zdCByZWcgPSBjcmVhdGVGaWxlUmVnaXN0cnkocm9vdCwgKHByb3RvRmlsZU5hbWUpID0+IGltcG9ydHMgPT09IG51bGwgfHwgaW1wb3J0cyA9PT0gdm9pZCAwID8gdm9pZCAwIDogaW1wb3J0cy5maW5kKChmKSA9PiBmLnByb3RvLm5hbWUgPT09IHByb3RvRmlsZU5hbWUpKTtcbiAgICAvLyBiaW9tZS1pZ25vcmUgbGludC9zdHlsZS9ub05vbk51bGxBc3NlcnRpb246IG5vbi1udWxsIGFzc2VydGlvbiBiZWNhdXNlIHdlIGp1c3QgY3JlYXRlZCB0aGUgcmVnaXN0cnkgZnJvbSB0aGUgZmlsZSB3ZSBsb29rIHVwXG4gICAgcmV0dXJuIHJlZy5nZXRGaWxlKHJvb3QubmFtZSk7XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbmltcG9ydCB7IHJlZmxlY3QgfSBmcm9tIFwiLi9yZWZsZWN0L3JlZmxlY3QuanNcIjtcbmltcG9ydCB7IEJpbmFyeVdyaXRlciwgV2lyZVR5cGUgfSBmcm9tIFwiLi93aXJlL2JpbmFyeS1lbmNvZGluZy5qc1wiO1xuaW1wb3J0IHsgU2NhbGFyVHlwZSB9IGZyb20gXCIuL2Rlc2NyaXB0b3JzLmpzXCI7XG4vLyBib290c3RyYXAtaW5qZWN0IGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LkZpZWxkUHJlc2VuY2UuTEVHQUNZX1JFUVVJUkVEOiBjb25zdCAkbmFtZTogRmVhdHVyZVNldF9GaWVsZFByZXNlbmNlLiRsb2NhbE5hbWUgPSAkbnVtYmVyO1xuY29uc3QgTEVHQUNZX1JFUVVJUkVEID0gMztcbi8vIERlZmF1bHQgb3B0aW9ucyBmb3Igc2VyaWFsaXppbmcgYmluYXJ5IGRhdGEuXG5jb25zdCB3cml0ZURlZmF1bHRzID0ge1xuICAgIHdyaXRlVW5rbm93bkZpZWxkczogdHJ1ZSxcbn07XG5mdW5jdGlvbiBtYWtlV3JpdGVPcHRpb25zKG9wdGlvbnMpIHtcbiAgICByZXR1cm4gb3B0aW9ucyA/IE9iamVjdC5hc3NpZ24oT2JqZWN0LmFzc2lnbih7fSwgd3JpdGVEZWZhdWx0cyksIG9wdGlvbnMpIDogd3JpdGVEZWZhdWx0cztcbn1cbmV4cG9ydCBmdW5jdGlvbiB0b0JpbmFyeShzY2hlbWEsIG1lc3NhZ2UsIG9wdGlvbnMpIHtcbiAgICByZXR1cm4gd3JpdGVGaWVsZHMobmV3IEJpbmFyeVdyaXRlcigpLCBtYWtlV3JpdGVPcHRpb25zKG9wdGlvbnMpLCByZWZsZWN0KHNjaGVtYSwgbWVzc2FnZSkpLmZpbmlzaCgpO1xufVxuZnVuY3Rpb24gd3JpdGVGaWVsZHMod3JpdGVyLCBvcHRzLCBtc2cpIHtcbiAgICB2YXIgX2E7XG4gICAgZm9yIChjb25zdCBmIG9mIG1zZy5zb3J0ZWRGaWVsZHMpIHtcbiAgICAgICAgaWYgKCFtc2cuaXNTZXQoZikpIHtcbiAgICAgICAgICAgIGlmIChmLnByZXNlbmNlID09IExFR0FDWV9SRVFVSVJFRCkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGVuY29kZSAke2Z9IHRvIGJpbmFyeTogcmVxdWlyZWQgZmllbGQgbm90IHNldGApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgd3JpdGVGaWVsZCh3cml0ZXIsIG9wdHMsIG1zZywgZik7XG4gICAgfVxuICAgIGlmIChvcHRzLndyaXRlVW5rbm93bkZpZWxkcykge1xuICAgICAgICBmb3IgKGNvbnN0IHsgbm8sIHdpcmVUeXBlLCBkYXRhIH0gb2YgKF9hID0gbXNnLmdldFVua25vd24oKSkgIT09IG51bGwgJiYgX2EgIT09IHZvaWQgMCA/IF9hIDogW10pIHtcbiAgICAgICAgICAgIHdyaXRlci50YWcobm8sIHdpcmVUeXBlKS5yYXcoZGF0YSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHdyaXRlcjtcbn1cbi8qKlxuICogQHByaXZhdGVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdyaXRlRmllbGQod3JpdGVyLCBvcHRzLCBtc2csIGZpZWxkKSB7XG4gICAgdmFyIF9hO1xuICAgIHN3aXRjaCAoZmllbGQuZmllbGRLaW5kKSB7XG4gICAgICAgIGNhc2UgXCJzY2FsYXJcIjpcbiAgICAgICAgY2FzZSBcImVudW1cIjpcbiAgICAgICAgICAgIHdyaXRlU2NhbGFyKHdyaXRlciwgbXNnLmRlc2MudHlwZU5hbWUsIGZpZWxkLm5hbWUsIChfYSA9IGZpZWxkLnNjYWxhcikgIT09IG51bGwgJiYgX2EgIT09IHZvaWQgMCA/IF9hIDogU2NhbGFyVHlwZS5JTlQzMiwgZmllbGQubnVtYmVyLCBtc2cuZ2V0KGZpZWxkKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImxpc3RcIjpcbiAgICAgICAgICAgIHdyaXRlTGlzdEZpZWxkKHdyaXRlciwgb3B0cywgZmllbGQsIG1zZy5nZXQoZmllbGQpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwibWVzc2FnZVwiOlxuICAgICAgICAgICAgd3JpdGVNZXNzYWdlRmllbGQod3JpdGVyLCBvcHRzLCBmaWVsZCwgbXNnLmdldChmaWVsZCkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJtYXBcIjpcbiAgICAgICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsXSBvZiBtc2cuZ2V0KGZpZWxkKSkge1xuICAgICAgICAgICAgICAgIHdyaXRlTWFwRW50cnkod3JpdGVyLCBvcHRzLCBmaWVsZCwga2V5LCB2YWwpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxufVxuZnVuY3Rpb24gd3JpdGVTY2FsYXIod3JpdGVyLCBtc2dOYW1lLCBmaWVsZE5hbWUsIHNjYWxhclR5cGUsIGZpZWxkTm8sIHZhbHVlKSB7XG4gICAgd3JpdGVTY2FsYXJWYWx1ZSh3cml0ZXIudGFnKGZpZWxkTm8sIHdyaXRlVHlwZU9mU2NhbGFyKHNjYWxhclR5cGUpKSwgbXNnTmFtZSwgZmllbGROYW1lLCBzY2FsYXJUeXBlLCB2YWx1ZSk7XG59XG5mdW5jdGlvbiB3cml0ZU1lc3NhZ2VGaWVsZCh3cml0ZXIsIG9wdHMsIGZpZWxkLCBtZXNzYWdlKSB7XG4gICAgaWYgKGZpZWxkLmRlbGltaXRlZEVuY29kaW5nKSB7XG4gICAgICAgIHdyaXRlRmllbGRzKHdyaXRlci50YWcoZmllbGQubnVtYmVyLCBXaXJlVHlwZS5TdGFydEdyb3VwKSwgb3B0cywgbWVzc2FnZSkudGFnKGZpZWxkLm51bWJlciwgV2lyZVR5cGUuRW5kR3JvdXApO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgd3JpdGVGaWVsZHMod3JpdGVyLnRhZyhmaWVsZC5udW1iZXIsIFdpcmVUeXBlLkxlbmd0aERlbGltaXRlZCkuZm9yaygpLCBvcHRzLCBtZXNzYWdlKS5qb2luKCk7XG4gICAgfVxufVxuZnVuY3Rpb24gd3JpdGVMaXN0RmllbGQod3JpdGVyLCBvcHRzLCBmaWVsZCwgbGlzdCkge1xuICAgIHZhciBfYTtcbiAgICBpZiAoZmllbGQubGlzdEtpbmQgPT0gXCJtZXNzYWdlXCIpIHtcbiAgICAgICAgZm9yIChjb25zdCBpdGVtIG9mIGxpc3QpIHtcbiAgICAgICAgICAgIHdyaXRlTWVzc2FnZUZpZWxkKHdyaXRlciwgb3B0cywgZmllbGQsIGl0ZW0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3Qgc2NhbGFyVHlwZSA9IChfYSA9IGZpZWxkLnNjYWxhcikgIT09IG51bGwgJiYgX2EgIT09IHZvaWQgMCA/IF9hIDogU2NhbGFyVHlwZS5JTlQzMjtcbiAgICBpZiAoZmllbGQucGFja2VkKSB7XG4gICAgICAgIGlmICghbGlzdC5zaXplKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgd3JpdGVyLnRhZyhmaWVsZC5udW1iZXIsIFdpcmVUeXBlLkxlbmd0aERlbGltaXRlZCkuZm9yaygpO1xuICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgbGlzdCkge1xuICAgICAgICAgICAgd3JpdGVTY2FsYXJWYWx1ZSh3cml0ZXIsIGZpZWxkLnBhcmVudC50eXBlTmFtZSwgZmllbGQubmFtZSwgc2NhbGFyVHlwZSwgaXRlbSk7XG4gICAgICAgIH1cbiAgICAgICAgd3JpdGVyLmpvaW4oKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgbGlzdCkge1xuICAgICAgICB3cml0ZVNjYWxhcih3cml0ZXIsIGZpZWxkLnBhcmVudC50eXBlTmFtZSwgZmllbGQubmFtZSwgc2NhbGFyVHlwZSwgZmllbGQubnVtYmVyLCBpdGVtKTtcbiAgICB9XG59XG5mdW5jdGlvbiB3cml0ZU1hcEVudHJ5KHdyaXRlciwgb3B0cywgZmllbGQsIGtleSwgdmFsdWUpIHtcbiAgICB2YXIgX2E7XG4gICAgd3JpdGVyLnRhZyhmaWVsZC5udW1iZXIsIFdpcmVUeXBlLkxlbmd0aERlbGltaXRlZCkuZm9yaygpO1xuICAgIC8vIHdyaXRlIGtleSwgZXhwZWN0aW5nIGtleSBmaWVsZCBudW1iZXIgPSAxXG4gICAgd3JpdGVTY2FsYXIod3JpdGVyLCBmaWVsZC5wYXJlbnQudHlwZU5hbWUsIGZpZWxkLm5hbWUsIGZpZWxkLm1hcEtleSwgMSwga2V5KTtcbiAgICAvLyB3cml0ZSB2YWx1ZSwgZXhwZWN0aW5nIHZhbHVlIGZpZWxkIG51bWJlciA9IDJcbiAgICBzd2l0Y2ggKGZpZWxkLm1hcEtpbmQpIHtcbiAgICAgICAgY2FzZSBcInNjYWxhclwiOlxuICAgICAgICBjYXNlIFwiZW51bVwiOlxuICAgICAgICAgICAgd3JpdGVTY2FsYXIod3JpdGVyLCBmaWVsZC5wYXJlbnQudHlwZU5hbWUsIGZpZWxkLm5hbWUsIChfYSA9IGZpZWxkLnNjYWxhcikgIT09IG51bGwgJiYgX2EgIT09IHZvaWQgMCA/IF9hIDogU2NhbGFyVHlwZS5JTlQzMiwgMiwgdmFsdWUpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJtZXNzYWdlXCI6XG4gICAgICAgICAgICB3cml0ZUZpZWxkcyh3cml0ZXIudGFnKDIsIFdpcmVUeXBlLkxlbmd0aERlbGltaXRlZCkuZm9yaygpLCBvcHRzLCB2YWx1ZSkuam9pbigpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHdyaXRlci5qb2luKCk7XG59XG5mdW5jdGlvbiB3cml0ZVNjYWxhclZhbHVlKHdyaXRlciwgbXNnTmFtZSwgZmllbGROYW1lLCB0eXBlLCB2YWx1ZSkge1xuICAgIHRyeSB7XG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNUUklORzpcbiAgICAgICAgICAgICAgICB3cml0ZXIuc3RyaW5nKHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgU2NhbGFyVHlwZS5CT09MOlxuICAgICAgICAgICAgICAgIHdyaXRlci5ib29sKHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgU2NhbGFyVHlwZS5ET1VCTEU6XG4gICAgICAgICAgICAgICAgd3JpdGVyLmRvdWJsZSh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFNjYWxhclR5cGUuRkxPQVQ6XG4gICAgICAgICAgICAgICAgd3JpdGVyLmZsb2F0KHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgU2NhbGFyVHlwZS5JTlQzMjpcbiAgICAgICAgICAgICAgICB3cml0ZXIuaW50MzIodmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBTY2FsYXJUeXBlLklOVDY0OlxuICAgICAgICAgICAgICAgIHdyaXRlci5pbnQ2NCh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFNjYWxhclR5cGUuVUlOVDY0OlxuICAgICAgICAgICAgICAgIHdyaXRlci51aW50NjQodmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZJWEVENjQ6XG4gICAgICAgICAgICAgICAgd3JpdGVyLmZpeGVkNjQodmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkJZVEVTOlxuICAgICAgICAgICAgICAgIHdyaXRlci5ieXRlcyh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFNjYWxhclR5cGUuRklYRUQzMjpcbiAgICAgICAgICAgICAgICB3cml0ZXIuZml4ZWQzMih2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0ZJWEVEMzI6XG4gICAgICAgICAgICAgICAgd3JpdGVyLnNmaXhlZDMyKHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TRklYRUQ2NDpcbiAgICAgICAgICAgICAgICB3cml0ZXIuc2ZpeGVkNjQodmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNJTlQ2NDpcbiAgICAgICAgICAgICAgICB3cml0ZXIuc2ludDY0KHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgU2NhbGFyVHlwZS5VSU5UMzI6XG4gICAgICAgICAgICAgICAgd3JpdGVyLnVpbnQzMih2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0lOVDMyOlxuICAgICAgICAgICAgICAgIHdyaXRlci5zaW50MzIodmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuICAgIGNhdGNoIChlKSB7XG4gICAgICAgIGlmIChlIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGVuY29kZSBmaWVsZCAke21zZ05hbWV9LiR7ZmllbGROYW1lfSB0byBiaW5hcnk6ICR7ZS5tZXNzYWdlfWApO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGU7XG4gICAgfVxufVxuZnVuY3Rpb24gd3JpdGVUeXBlT2ZTY2FsYXIodHlwZSkge1xuICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuQllURVM6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TVFJJTkc6XG4gICAgICAgICAgICByZXR1cm4gV2lyZVR5cGUuTGVuZ3RoRGVsaW1pdGVkO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRE9VQkxFOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRklYRUQ2NDpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNGSVhFRDY0OlxuICAgICAgICAgICAgcmV0dXJuIFdpcmVUeXBlLkJpdDY0O1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRklYRUQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNGSVhFRDMyOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRkxPQVQ6XG4gICAgICAgICAgICByZXR1cm4gV2lyZVR5cGUuQml0MzI7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gV2lyZVR5cGUuVmFyaW50O1xuICAgIH1cbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuLyoqXG4gKiBIeWRyYXRlIGFuIGV4dGVuc2lvbiBkZXNjcmlwdG9yLlxuICpcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBleHREZXNjKGZpbGUsIHBhdGgsIC4uLnBhdGhzKSB7XG4gICAgaWYgKHBhdGhzLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIHJldHVybiBmaWxlLmV4dGVuc2lvbnNbcGF0aF07XG4gICAgfVxuICAgIGNvbnN0IGUgPSBwYXRocy5wb3AoKTsgLy8gd2UgY2hlY2tlZCBsZW5ndGggYWJvdmVcbiAgICByZXR1cm4gcGF0aHMucmVkdWNlKChhY2MsIGN1cikgPT4gYWNjLm5lc3RlZE1lc3NhZ2VzW2N1cl0sIGZpbGUubWVzc2FnZXNbcGF0aF0pLm5lc3RlZEV4dGVuc2lvbnNbZV07XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbmltcG9ydCB7IHNjYWxhckVxdWFscyB9IGZyb20gXCIuL3JlZmxlY3Qvc2NhbGFyLmpzXCI7XG5pbXBvcnQgeyByZWZsZWN0IH0gZnJvbSBcIi4vcmVmbGVjdC9yZWZsZWN0LmpzXCI7XG5pbXBvcnQgeyBTY2FsYXJUeXBlLCB9IGZyb20gXCIuL2Rlc2NyaXB0b3JzLmpzXCI7XG5pbXBvcnQgeyBhbnlVbnBhY2sgfSBmcm9tIFwiLi93a3QvaW5kZXguanNcIjtcbmltcG9ydCB7IGNyZWF0ZUV4dGVuc2lvbkNvbnRhaW5lciwgZ2V0RXh0ZW5zaW9uIH0gZnJvbSBcIi4vZXh0ZW5zaW9ucy5qc1wiO1xuLyoqXG4gKiBDb21wYXJlIHR3byBtZXNzYWdlcyBvZiB0aGUgc2FtZSB0eXBlLlxuICpcbiAqIE5vdGUgdGhhdCB0aGlzIGZ1bmN0aW9uIGRpc3JlZ2FyZHMgZXh0ZW5zaW9ucyBhbmQgdW5rbm93biBmaWVsZHMsIGFuZCB0aGF0XG4gKiBOYU4gaXMgbm90IGVxdWFsIE5hTiwgZm9sbG93aW5nIHRoZSBJRUVFIHN0YW5kYXJkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZXF1YWxzKHNjaGVtYSwgYSwgYiwgb3B0aW9ucykge1xuICAgIGlmIChhLiR0eXBlTmFtZSAhPSBzY2hlbWEudHlwZU5hbWUgfHwgYi4kdHlwZU5hbWUgIT0gc2NoZW1hLnR5cGVOYW1lKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKGEgPT09IGIpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiByZWZsZWN0RXF1YWxzKHJlZmxlY3Qoc2NoZW1hLCBhKSwgcmVmbGVjdChzY2hlbWEsIGIpLCBvcHRpb25zKTtcbn1cbmZ1bmN0aW9uIHJlZmxlY3RFcXVhbHMoYSwgYiwgb3B0cykge1xuICAgIGlmIChhLmRlc2MudHlwZU5hbWUgPT09IFwiZ29vZ2xlLnByb3RvYnVmLkFueVwiICYmIChvcHRzID09PSBudWxsIHx8IG9wdHMgPT09IHZvaWQgMCA/IHZvaWQgMCA6IG9wdHMudW5wYWNrQW55KSA9PSB0cnVlKSB7XG4gICAgICAgIHJldHVybiBhbnlVbnBhY2tlZEVxdWFscyhhLm1lc3NhZ2UsIGIubWVzc2FnZSwgb3B0cyk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgZiBvZiBhLmZpZWxkcykge1xuICAgICAgICBpZiAoIWZpZWxkRXF1YWxzKGYsIGEsIGIsIG9wdHMpKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKChvcHRzID09PSBudWxsIHx8IG9wdHMgPT09IHZvaWQgMCA/IHZvaWQgMCA6IG9wdHMudW5rbm93bikgPT0gdHJ1ZSAmJiAhdW5rbm93bkVxdWFscyhhLCBiLCBvcHRzLnJlZ2lzdHJ5KSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGlmICgob3B0cyA9PT0gbnVsbCB8fCBvcHRzID09PSB2b2lkIDAgPyB2b2lkIDAgOiBvcHRzLmV4dGVuc2lvbnMpID09IHRydWUgJiYgIWV4dGVuc2lvbnNFcXVhbHMoYSwgYiwgb3B0cykpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbn1cbi8vIFRPRE8odHN0YW1tKSBhZGQgYW4gb3B0aW9uIHRvIGNvbnNpZGVyIE5hTiBlcXVhbCB0byBOYU4/XG5mdW5jdGlvbiBmaWVsZEVxdWFscyhmLCBhLCBiLCBvcHRzKSB7XG4gICAgaWYgKCFhLmlzU2V0KGYpICYmICFiLmlzU2V0KGYpKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBpZiAoIWEuaXNTZXQoZikgfHwgIWIuaXNTZXQoZikpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBzd2l0Y2ggKGYuZmllbGRLaW5kKSB7XG4gICAgICAgIGNhc2UgXCJzY2FsYXJcIjpcbiAgICAgICAgICAgIHJldHVybiBzY2FsYXJFcXVhbHMoZi5zY2FsYXIsIGEuZ2V0KGYpLCBiLmdldChmKSk7XG4gICAgICAgIGNhc2UgXCJlbnVtXCI6XG4gICAgICAgICAgICByZXR1cm4gYS5nZXQoZikgPT09IGIuZ2V0KGYpO1xuICAgICAgICBjYXNlIFwibWVzc2FnZVwiOlxuICAgICAgICAgICAgcmV0dXJuIHJlZmxlY3RFcXVhbHMoYS5nZXQoZiksIGIuZ2V0KGYpLCBvcHRzKTtcbiAgICAgICAgY2FzZSBcIm1hcFwiOiB7XG4gICAgICAgICAgICAvLyBUT0RPKHRzdGFtbSkgY2FuJ3Qgd2UgY29tcGFyZSBzaXplcyBmaXJzdD9cbiAgICAgICAgICAgIGNvbnN0IG1hcEEgPSBhLmdldChmKTtcbiAgICAgICAgICAgIGNvbnN0IG1hcEIgPSBiLmdldChmKTtcbiAgICAgICAgICAgIGNvbnN0IGtleXMgPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgayBvZiBtYXBBLmtleXMoKSkge1xuICAgICAgICAgICAgICAgIGlmICghbWFwQi5oYXMoaykpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBrZXlzLnB1c2goayk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGsgb2YgbWFwQi5rZXlzKCkpIHtcbiAgICAgICAgICAgICAgICBpZiAoIW1hcEEuaGFzKGspKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdmEgPSBtYXBBLmdldChrZXkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHZiID0gbWFwQi5nZXQoa2V5KTtcbiAgICAgICAgICAgICAgICBpZiAodmEgPT09IHZiKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzd2l0Y2ggKGYubWFwS2luZCkge1xuICAgICAgICAgICAgICAgICAgICBjYXNlIFwiZW51bVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIFwibWVzc2FnZVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFyZWZsZWN0RXF1YWxzKHZhLCB2Yiwgb3B0cykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcInNjYWxhclwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFzY2FsYXJFcXVhbHMoZi5zY2FsYXIsIHZhLCB2YikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlIFwibGlzdFwiOiB7XG4gICAgICAgICAgICBjb25zdCBsaXN0QSA9IGEuZ2V0KGYpO1xuICAgICAgICAgICAgY29uc3QgbGlzdEIgPSBiLmdldChmKTtcbiAgICAgICAgICAgIGlmIChsaXN0QS5zaXplICE9IGxpc3RCLnNpemUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxpc3RBLnNpemU7IGkrKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHZhID0gbGlzdEEuZ2V0KGkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHZiID0gbGlzdEIuZ2V0KGkpO1xuICAgICAgICAgICAgICAgIGlmICh2YSA9PT0gdmIpIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHN3aXRjaCAoZi5saXN0S2luZCkge1xuICAgICAgICAgICAgICAgICAgICBjYXNlIFwiZW51bVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIFwibWVzc2FnZVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFyZWZsZWN0RXF1YWxzKHZhLCB2Yiwgb3B0cykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcInNjYWxhclwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFzY2FsYXJFcXVhbHMoZi5zY2FsYXIsIHZhLCB2YikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbn1cbmZ1bmN0aW9uIGFueVVucGFja2VkRXF1YWxzKGEsIGIsIG9wdHMpIHtcbiAgICBpZiAoYS50eXBlVXJsICE9PSBiLnR5cGVVcmwpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBjb25zdCB1bnBhY2tlZEEgPSBhbnlVbnBhY2soYSwgb3B0cy5yZWdpc3RyeSk7XG4gICAgY29uc3QgdW5wYWNrZWRCID0gYW55VW5wYWNrKGIsIG9wdHMucmVnaXN0cnkpO1xuICAgIGlmICh1bnBhY2tlZEEgJiYgdW5wYWNrZWRCKSB7XG4gICAgICAgIGNvbnN0IHNjaGVtYSA9IG9wdHMucmVnaXN0cnkuZ2V0TWVzc2FnZSh1bnBhY2tlZEEuJHR5cGVOYW1lKTtcbiAgICAgICAgaWYgKHNjaGVtYSkge1xuICAgICAgICAgICAgcmV0dXJuIGVxdWFscyhzY2hlbWEsIHVucGFja2VkQSwgdW5wYWNrZWRCLCBvcHRzKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gc2NhbGFyRXF1YWxzKFNjYWxhclR5cGUuQllURVMsIGEudmFsdWUsIGIudmFsdWUpO1xufVxuZnVuY3Rpb24gdW5rbm93bkVxdWFscyhhLCBiLCByZWdpc3RyeSkge1xuICAgIGZ1bmN0aW9uIGdldFRydWx5VW5rbm93bihtc2csIHJlZ2lzdHJ5KSB7XG4gICAgICAgIHZhciBfYTtcbiAgICAgICAgY29uc3QgdSA9IChfYSA9IG1zZy5nZXRVbmtub3duKCkpICE9PSBudWxsICYmIF9hICE9PSB2b2lkIDAgPyBfYSA6IFtdO1xuICAgICAgICByZXR1cm4gcmVnaXN0cnlcbiAgICAgICAgICAgID8gdS5maWx0ZXIoKHVmKSA9PiAhcmVnaXN0cnkuZ2V0RXh0ZW5zaW9uRm9yKG1zZy5kZXNjLCB1Zi5ubykpXG4gICAgICAgICAgICA6IHU7XG4gICAgfVxuICAgIGNvbnN0IHVua25vd25BID0gZ2V0VHJ1bHlVbmtub3duKGEsIHJlZ2lzdHJ5KTtcbiAgICBjb25zdCB1bmtub3duQiA9IGdldFRydWx5VW5rbm93bihiLCByZWdpc3RyeSk7XG4gICAgaWYgKHVua25vd25BLmxlbmd0aCAhPSB1bmtub3duQi5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHVua25vd25BLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGEgPSB1bmtub3duQVtpXTtcbiAgICAgICAgY29uc3QgYiA9IHVua25vd25CW2ldO1xuICAgICAgICBpZiAoYS5ubyAhPSBiLm5vKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGEud2lyZVR5cGUgIT0gYi53aXJlVHlwZSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGlmICghc2NhbGFyRXF1YWxzKFNjYWxhclR5cGUuQllURVMsIGEuZGF0YSwgYi5kYXRhKSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xufVxuZnVuY3Rpb24gZXh0ZW5zaW9uc0VxdWFscyhhLCBiLCBvcHRzKSB7XG4gICAgZnVuY3Rpb24gZ2V0U2V0RXh0ZW5zaW9ucyhtc2csIHJlZ2lzdHJ5KSB7XG4gICAgICAgIHZhciBfYTtcbiAgICAgICAgcmV0dXJuICgoX2EgPSBtc2cuZ2V0VW5rbm93bigpKSAhPT0gbnVsbCAmJiBfYSAhPT0gdm9pZCAwID8gX2EgOiBbXSlcbiAgICAgICAgICAgIC5tYXAoKHVmKSA9PiByZWdpc3RyeS5nZXRFeHRlbnNpb25Gb3IobXNnLmRlc2MsIHVmLm5vKSlcbiAgICAgICAgICAgIC5maWx0ZXIoKGUpID0+IGUgIT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgLmZpbHRlcigoZSwgaW5kZXgsIGFycikgPT4gYXJyLmluZGV4T2YoZSkgPT09IGluZGV4KTtcbiAgICB9XG4gICAgY29uc3QgZXh0ZW5zaW9uc0EgPSBnZXRTZXRFeHRlbnNpb25zKGEsIG9wdHMucmVnaXN0cnkpO1xuICAgIGNvbnN0IGV4dGVuc2lvbnNCID0gZ2V0U2V0RXh0ZW5zaW9ucyhiLCBvcHRzLnJlZ2lzdHJ5KTtcbiAgICBpZiAoZXh0ZW5zaW9uc0EubGVuZ3RoICE9IGV4dGVuc2lvbnNCLmxlbmd0aCB8fFxuICAgICAgICBleHRlbnNpb25zQS5zb21lKChlKSA9PiAhZXh0ZW5zaW9uc0IuaW5jbHVkZXMoZSkpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9uc0EpIHtcbiAgICAgICAgY29uc3QgW2NvbnRhaW5lckEsIGZpZWxkXSA9IGNyZWF0ZUV4dGVuc2lvbkNvbnRhaW5lcihleHRlbnNpb24sIGdldEV4dGVuc2lvbihhLm1lc3NhZ2UsIGV4dGVuc2lvbikpO1xuICAgICAgICBjb25zdCBbY29udGFpbmVyQl0gPSBjcmVhdGVFeHRlbnNpb25Db250YWluZXIoZXh0ZW5zaW9uLCBnZXRFeHRlbnNpb24oYi5tZXNzYWdlLCBleHRlbnNpb24pKTtcbiAgICAgICAgaWYgKCFmaWVsZEVxdWFscyhmaWVsZCwgY29udGFpbmVyQSwgY29udGFpbmVyQiwgb3B0cykpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuaW1wb3J0IHsgdW5zYWZlQ2xlYXIsIHVuc2FmZUlzU2V0IH0gZnJvbSBcIi4vcmVmbGVjdC91bnNhZmUuanNcIjtcbi8qKlxuICogUmV0dXJucyB0cnVlIGlmIHRoZSBmaWVsZCBpcyBzZXQuXG4gKlxuICogLSBTY2FsYXIgYW5kIGVudW0gZmllbGRzIHdpdGggaW1wbGljaXQgcHJlc2VuY2UgKHByb3RvMyk6XG4gKiAgIFNldCBpZiBub3QgYSB6ZXJvIHZhbHVlLlxuICpcbiAqIC0gU2NhbGFyIGFuZCBlbnVtIGZpZWxkcyB3aXRoIGV4cGxpY2l0IHByZXNlbmNlIChwcm90bzIsIG9uZW9mKTpcbiAqICAgU2V0IGlmIGEgdmFsdWUgd2FzIHNldCB3aGVuIGNyZWF0aW5nIG9yIHBhcnNpbmcgdGhlIG1lc3NhZ2UsIG9yIHdoZW4gYVxuICogICB2YWx1ZSB3YXMgYXNzaWduZWQgdG8gdGhlIGZpZWxkJ3MgcHJvcGVydHkuXG4gKlxuICogLSBNZXNzYWdlIGZpZWxkczpcbiAqICAgU2V0IGlmIHRoZSBwcm9wZXJ0eSBpcyBub3QgdW5kZWZpbmVkLlxuICpcbiAqIC0gTGlzdCBhbmQgbWFwIGZpZWxkczpcbiAqICAgU2V0IGlmIG5vdCBlbXB0eS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzRmllbGRTZXQobWVzc2FnZSwgZmllbGQpIHtcbiAgICByZXR1cm4gKGZpZWxkLnBhcmVudC50eXBlTmFtZSA9PSBtZXNzYWdlLiR0eXBlTmFtZSAmJiB1bnNhZmVJc1NldChtZXNzYWdlLCBmaWVsZCkpO1xufVxuLyoqXG4gKiBSZXNldHMgdGhlIGZpZWxkLCBzbyB0aGF0IGlzRmllbGRTZXQoKSB3aWxsIHJldHVybiBmYWxzZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNsZWFyRmllbGQobWVzc2FnZSwgZmllbGQpIHtcbiAgICBpZiAoZmllbGQucGFyZW50LnR5cGVOYW1lID09IG1lc3NhZ2UuJHR5cGVOYW1lKSB7XG4gICAgICAgIHVuc2FmZUNsZWFyKG1lc3NhZ2UsIGZpZWxkKTtcbiAgICB9XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbmltcG9ydCB7IFNjYWxhclR5cGUsIH0gZnJvbSBcIi4vZGVzY3JpcHRvcnMuanNcIjtcbmltcG9ydCB7IHByb3RvQ2FtZWxDYXNlIH0gZnJvbSBcIi4vcmVmbGVjdC9uYW1lcy5qc1wiO1xuaW1wb3J0IHsgcmVmbGVjdCB9IGZyb20gXCIuL3JlZmxlY3QvcmVmbGVjdC5qc1wiO1xuaW1wb3J0IHsgYW55VW5wYWNrIH0gZnJvbSBcIi4vd2t0L2luZGV4LmpzXCI7XG5pbXBvcnQgeyBpc1dyYXBwZXJEZXNjIH0gZnJvbSBcIi4vd2t0L3dyYXBwZXJzLmpzXCI7XG5pbXBvcnQgeyBiYXNlNjRFbmNvZGUgfSBmcm9tIFwiLi93aXJlL2luZGV4LmpzXCI7XG5pbXBvcnQgeyBjcmVhdGVFeHRlbnNpb25Db250YWluZXIsIGdldEV4dGVuc2lvbiB9IGZyb20gXCIuL2V4dGVuc2lvbnMuanNcIjtcbmltcG9ydCB7IGNoZWNrRmllbGQsIGZvcm1hdFZhbCB9IGZyb20gXCIuL3JlZmxlY3QvcmVmbGVjdC1jaGVjay5qc1wiO1xuLy8gYm9vdHN0cmFwLWluamVjdCBnb29nbGUucHJvdG9idWYuRmVhdHVyZVNldC5GaWVsZFByZXNlbmNlLkxFR0FDWV9SRVFVSVJFRDogY29uc3QgJG5hbWU6IEZlYXR1cmVTZXRfRmllbGRQcmVzZW5jZS4kbG9jYWxOYW1lID0gJG51bWJlcjtcbmNvbnN0IExFR0FDWV9SRVFVSVJFRCA9IDM7XG4vLyBib290c3RyYXAtaW5qZWN0IGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LkZpZWxkUHJlc2VuY2UuSU1QTElDSVQ6IGNvbnN0ICRuYW1lOiBGZWF0dXJlU2V0X0ZpZWxkUHJlc2VuY2UuJGxvY2FsTmFtZSA9ICRudW1iZXI7XG5jb25zdCBJTVBMSUNJVCA9IDI7XG4vLyBEZWZhdWx0IG9wdGlvbnMgZm9yIHNlcmlhbGl6aW5nIHRvIEpTT04uXG5jb25zdCBqc29uV3JpdGVEZWZhdWx0cyA9IHtcbiAgICBhbHdheXNFbWl0SW1wbGljaXQ6IGZhbHNlLFxuICAgIGVudW1Bc0ludGVnZXI6IGZhbHNlLFxuICAgIHVzZVByb3RvRmllbGROYW1lOiBmYWxzZSxcbn07XG5mdW5jdGlvbiBtYWtlV3JpdGVPcHRpb25zKG9wdGlvbnMpIHtcbiAgICByZXR1cm4gb3B0aW9ucyA/IE9iamVjdC5hc3NpZ24oT2JqZWN0LmFzc2lnbih7fSwganNvbldyaXRlRGVmYXVsdHMpLCBvcHRpb25zKSA6IGpzb25Xcml0ZURlZmF1bHRzO1xufVxuLyoqXG4gKiBTZXJpYWxpemUgdGhlIG1lc3NhZ2UgdG8gYSBKU09OIHZhbHVlLCBhIEphdmFTY3JpcHQgdmFsdWUgdGhhdCBjYW4gYmVcbiAqIHBhc3NlZCB0byBKU09OLnN0cmluZ2lmeSgpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9Kc29uKHNjaGVtYSwgbWVzc2FnZSwgb3B0aW9ucykge1xuICAgIHJldHVybiByZWZsZWN0VG9Kc29uKHJlZmxlY3Qoc2NoZW1hLCBtZXNzYWdlKSwgbWFrZVdyaXRlT3B0aW9ucyhvcHRpb25zKSk7XG59XG4vKipcbiAqIFNlcmlhbGl6ZSB0aGUgbWVzc2FnZSB0byBhIEpTT04gc3RyaW5nLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9Kc29uU3RyaW5nKHNjaGVtYSwgbWVzc2FnZSwgb3B0aW9ucykge1xuICAgIHZhciBfYTtcbiAgICBjb25zdCBqc29uVmFsdWUgPSB0b0pzb24oc2NoZW1hLCBtZXNzYWdlLCBvcHRpb25zKTtcbiAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoanNvblZhbHVlLCBudWxsLCAoX2EgPSBvcHRpb25zID09PSBudWxsIHx8IG9wdGlvbnMgPT09IHZvaWQgMCA/IHZvaWQgMCA6IG9wdGlvbnMucHJldHR5U3BhY2VzKSAhPT0gbnVsbCAmJiBfYSAhPT0gdm9pZCAwID8gX2EgOiAwKTtcbn1cbi8qKlxuICogU2VyaWFsaXplIGEgc2luZ2xlIGVudW0gdmFsdWUgdG8gSlNPTi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVudW1Ub0pzb24oZGVzY0VudW0sIHZhbHVlKSB7XG4gICAgdmFyIF9hO1xuICAgIGlmIChkZXNjRW51bS50eXBlTmFtZSA9PSBcImdvb2dsZS5wcm90b2J1Zi5OdWxsVmFsdWVcIikge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgY29uc3QgbmFtZSA9IChfYSA9IGRlc2NFbnVtLnZhbHVlW3ZhbHVlXSkgPT09IG51bGwgfHwgX2EgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9hLm5hbWU7XG4gICAgaWYgKG5hbWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7dmFsdWV9IGlzIG5vdCBhIHZhbHVlIGluICR7ZGVzY0VudW19YCk7XG4gICAgfVxuICAgIHJldHVybiBuYW1lO1xufVxuZnVuY3Rpb24gcmVmbGVjdFRvSnNvbihtc2csIG9wdHMpIHtcbiAgICB2YXIgX2E7XG4gICAgY29uc3Qgd2t0SnNvbiA9IHRyeVdrdFRvSnNvbihtc2csIG9wdHMpO1xuICAgIGlmICh3a3RKc29uICE9PSB1bmRlZmluZWQpXG4gICAgICAgIHJldHVybiB3a3RKc29uO1xuICAgIGNvbnN0IGpzb24gPSB7fTtcbiAgICBmb3IgKGNvbnN0IGYgb2YgbXNnLnNvcnRlZEZpZWxkcykge1xuICAgICAgICBpZiAoIW1zZy5pc1NldChmKSkge1xuICAgICAgICAgICAgaWYgKGYucHJlc2VuY2UgPT0gTEVHQUNZX1JFUVVJUkVEKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZW5jb2RlICR7Zn0gdG8gSlNPTjogcmVxdWlyZWQgZmllbGQgbm90IHNldGApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFvcHRzLmFsd2F5c0VtaXRJbXBsaWNpdCB8fCBmLnByZXNlbmNlICE9PSBJTVBMSUNJVCkge1xuICAgICAgICAgICAgICAgIC8vIEZpZWxkcyB3aXRoIGltcGxpY2l0IHByZXNlbmNlIG9taXQgemVybyB2YWx1ZXMgKGUuZy4gZW1wdHkgc3RyaW5nKSBieSBkZWZhdWx0XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QganNvblZhbHVlID0gZmllbGRUb0pzb24oZiwgbXNnLmdldChmKSwgb3B0cyk7XG4gICAgICAgIGlmIChqc29uVmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAganNvbltqc29uTmFtZShmLCBvcHRzKV0gPSBqc29uVmFsdWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKG9wdHMucmVnaXN0cnkpIHtcbiAgICAgICAgY29uc3QgdGFnU2VlbiA9IG5ldyBTZXQoKTtcbiAgICAgICAgZm9yIChjb25zdCB7IG5vIH0gb2YgKF9hID0gbXNnLmdldFVua25vd24oKSkgIT09IG51bGwgJiYgX2EgIT09IHZvaWQgMCA/IF9hIDogW10pIHtcbiAgICAgICAgICAgIC8vIFNhbWUgdGFnIGNhbiBhcHBlYXIgbXVsdGlwbGUgdGltZXMsIHNvIHdlXG4gICAgICAgICAgICAvLyBrZWVwIHRyYWNrIGFuZCBza2lwIGlkZW50aWNhbCBvbmVzLlxuICAgICAgICAgICAgaWYgKCF0YWdTZWVuLmhhcyhubykpIHtcbiAgICAgICAgICAgICAgICB0YWdTZWVuLmFkZChubyk7XG4gICAgICAgICAgICAgICAgY29uc3QgZXh0ZW5zaW9uID0gb3B0cy5yZWdpc3RyeS5nZXRFeHRlbnNpb25Gb3IobXNnLmRlc2MsIG5vKTtcbiAgICAgICAgICAgICAgICBpZiAoIWV4dGVuc2lvbikge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBnZXRFeHRlbnNpb24obXNnLm1lc3NhZ2UsIGV4dGVuc2lvbik7XG4gICAgICAgICAgICAgICAgY29uc3QgW2NvbnRhaW5lciwgZmllbGRdID0gY3JlYXRlRXh0ZW5zaW9uQ29udGFpbmVyKGV4dGVuc2lvbiwgdmFsdWUpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGpzb25WYWx1ZSA9IGZpZWxkVG9Kc29uKGZpZWxkLCBjb250YWluZXIuZ2V0KGZpZWxkKSwgb3B0cyk7XG4gICAgICAgICAgICAgICAgaWYgKGpzb25WYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGpzb25bZXh0ZW5zaW9uLmpzb25OYW1lXSA9IGpzb25WYWx1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGpzb247XG59XG5mdW5jdGlvbiBmaWVsZFRvSnNvbihmLCB2YWwsIG9wdHMpIHtcbiAgICBzd2l0Y2ggKGYuZmllbGRLaW5kKSB7XG4gICAgICAgIGNhc2UgXCJzY2FsYXJcIjpcbiAgICAgICAgICAgIHJldHVybiBzY2FsYXJUb0pzb24oZiwgdmFsKTtcbiAgICAgICAgY2FzZSBcIm1lc3NhZ2VcIjpcbiAgICAgICAgICAgIHJldHVybiByZWZsZWN0VG9Kc29uKHZhbCwgb3B0cyk7XG4gICAgICAgIGNhc2UgXCJlbnVtXCI6XG4gICAgICAgICAgICByZXR1cm4gZW51bVRvSnNvbkludGVybmFsKGYuZW51bSwgdmFsLCBvcHRzLmVudW1Bc0ludGVnZXIpO1xuICAgICAgICBjYXNlIFwibGlzdFwiOlxuICAgICAgICAgICAgcmV0dXJuIGxpc3RUb0pzb24odmFsLCBvcHRzKTtcbiAgICAgICAgY2FzZSBcIm1hcFwiOlxuICAgICAgICAgICAgcmV0dXJuIG1hcFRvSnNvbih2YWwsIG9wdHMpO1xuICAgIH1cbn1cbmZ1bmN0aW9uIG1hcFRvSnNvbihtYXAsIG9wdHMpIHtcbiAgICBjb25zdCBmID0gbWFwLmZpZWxkKCk7XG4gICAgY29uc3QganNvbk9iaiA9IHt9O1xuICAgIHN3aXRjaCAoZi5tYXBLaW5kKSB7XG4gICAgICAgIGNhc2UgXCJzY2FsYXJcIjpcbiAgICAgICAgICAgIGZvciAoY29uc3QgW2VudHJ5S2V5LCBlbnRyeVZhbHVlXSBvZiBtYXApIHtcbiAgICAgICAgICAgICAgICBqc29uT2JqW2VudHJ5S2V5XSA9IHNjYWxhclRvSnNvbihmLCBlbnRyeVZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwibWVzc2FnZVwiOlxuICAgICAgICAgICAgZm9yIChjb25zdCBbZW50cnlLZXksIGVudHJ5VmFsdWVdIG9mIG1hcCkge1xuICAgICAgICAgICAgICAgIGpzb25PYmpbZW50cnlLZXldID0gcmVmbGVjdFRvSnNvbihlbnRyeVZhbHVlLCBvcHRzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiZW51bVwiOlxuICAgICAgICAgICAgZm9yIChjb25zdCBbZW50cnlLZXksIGVudHJ5VmFsdWVdIG9mIG1hcCkge1xuICAgICAgICAgICAgICAgIGpzb25PYmpbZW50cnlLZXldID0gZW51bVRvSnNvbkludGVybmFsKGYuZW51bSwgZW50cnlWYWx1ZSwgb3B0cy5lbnVtQXNJbnRlZ2VyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4gb3B0cy5hbHdheXNFbWl0SW1wbGljaXQgfHwgbWFwLnNpemUgPiAwID8ganNvbk9iaiA6IHVuZGVmaW5lZDtcbn1cbmZ1bmN0aW9uIGxpc3RUb0pzb24obGlzdCwgb3B0cykge1xuICAgIGNvbnN0IGYgPSBsaXN0LmZpZWxkKCk7XG4gICAgY29uc3QganNvbkFyciA9IFtdO1xuICAgIHN3aXRjaCAoZi5saXN0S2luZCkge1xuICAgICAgICBjYXNlIFwic2NhbGFyXCI6XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgbGlzdCkge1xuICAgICAgICAgICAgICAgIGpzb25BcnIucHVzaChzY2FsYXJUb0pzb24oZiwgaXRlbSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJlbnVtXCI6XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgbGlzdCkge1xuICAgICAgICAgICAgICAgIGpzb25BcnIucHVzaChlbnVtVG9Kc29uSW50ZXJuYWwoZi5lbnVtLCBpdGVtLCBvcHRzLmVudW1Bc0ludGVnZXIpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwibWVzc2FnZVwiOlxuICAgICAgICAgICAgZm9yIChjb25zdCBpdGVtIG9mIGxpc3QpIHtcbiAgICAgICAgICAgICAgICBqc29uQXJyLnB1c2gocmVmbGVjdFRvSnNvbihpdGVtLCBvcHRzKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIG9wdHMuYWx3YXlzRW1pdEltcGxpY2l0IHx8IGpzb25BcnIubGVuZ3RoID4gMCA/IGpzb25BcnIgOiB1bmRlZmluZWQ7XG59XG5mdW5jdGlvbiBlbnVtVG9Kc29uSW50ZXJuYWwoZGVzYywgdmFsdWUsIGVudW1Bc0ludGVnZXIpIHtcbiAgICB2YXIgX2E7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSAhPSBcIm51bWJlclwiKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGVuY29kZSAke2Rlc2N9IHRvIEpTT046IGV4cGVjdGVkIG51bWJlciwgZ290ICR7Zm9ybWF0VmFsKHZhbHVlKX1gKTtcbiAgICB9XG4gICAgaWYgKGRlc2MudHlwZU5hbWUgPT0gXCJnb29nbGUucHJvdG9idWYuTnVsbFZhbHVlXCIpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGlmIChlbnVtQXNJbnRlZ2VyKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG4gICAgY29uc3QgdmFsID0gZGVzYy52YWx1ZVt2YWx1ZV07XG4gICAgcmV0dXJuIChfYSA9IHZhbCA9PT0gbnVsbCB8fCB2YWwgPT09IHZvaWQgMCA/IHZvaWQgMCA6IHZhbC5uYW1lKSAhPT0gbnVsbCAmJiBfYSAhPT0gdm9pZCAwID8gX2EgOiB2YWx1ZTsgLy8gaWYgd2UgZG9uJ3Qga25vdyB0aGUgZW51bSB2YWx1ZSwganVzdCByZXR1cm4gdGhlIG51bWJlclxufVxuZnVuY3Rpb24gc2NhbGFyVG9Kc29uKGZpZWxkLCB2YWx1ZSkge1xuICAgIHZhciBfYSwgX2IsIF9jLCBfZCwgX2UsIF9mO1xuICAgIHN3aXRjaCAoZmllbGQuc2NhbGFyKSB7XG4gICAgICAgIC8vIGludDMyLCBmaXhlZDMyLCB1aW50MzI6IEpTT04gdmFsdWUgd2lsbCBiZSBhIGRlY2ltYWwgbnVtYmVyLiBFaXRoZXIgbnVtYmVycyBvciBzdHJpbmdzIGFyZSBhY2NlcHRlZC5cbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLklOVDMyOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0ZJWEVEMzI6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TSU5UMzI6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5GSVhFRDMyOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuVUlOVDMyOlxuICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPSBcIm51bWJlclwiKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZW5jb2RlICR7ZmllbGR9IHRvIEpTT046ICR7KF9hID0gY2hlY2tGaWVsZChmaWVsZCwgdmFsdWUpKSA9PT0gbnVsbCB8fCBfYSA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2EubWVzc2FnZX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgLy8gZmxvYXQsIGRvdWJsZTogSlNPTiB2YWx1ZSB3aWxsIGJlIGEgbnVtYmVyIG9yIG9uZSBvZiB0aGUgc3BlY2lhbCBzdHJpbmcgdmFsdWVzIFwiTmFOXCIsIFwiSW5maW5pdHlcIiwgYW5kIFwiLUluZmluaXR5XCIuXG4gICAgICAgIC8vIEVpdGhlciBudW1iZXJzIG9yIHN0cmluZ3MgYXJlIGFjY2VwdGVkLiBFeHBvbmVudCBub3RhdGlvbiBpcyBhbHNvIGFjY2VwdGVkLlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRkxPQVQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5ET1VCTEU6IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgbm8tZmFsbHRocm91Z2hcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgIT0gXCJudW1iZXJcIikge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGVuY29kZSAke2ZpZWxkfSB0byBKU09OOiAkeyhfYiA9IGNoZWNrRmllbGQoZmllbGQsIHZhbHVlKSkgPT09IG51bGwgfHwgX2IgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9iLm1lc3NhZ2V9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoTnVtYmVyLmlzTmFOKHZhbHVlKSlcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJOYU5cIjtcbiAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZKVxuICAgICAgICAgICAgICAgIHJldHVybiBcIkluZmluaXR5XCI7XG4gICAgICAgICAgICBpZiAodmFsdWUgPT09IE51bWJlci5ORUdBVElWRV9JTkZJTklUWSlcbiAgICAgICAgICAgICAgICByZXR1cm4gXCItSW5maW5pdHlcIjtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgLy8gc3RyaW5nOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU1RSSU5HOlxuICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZW5jb2RlICR7ZmllbGR9IHRvIEpTT046ICR7KF9jID0gY2hlY2tGaWVsZChmaWVsZCwgdmFsdWUpKSA9PT0gbnVsbCB8fCBfYyA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2MubWVzc2FnZX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgLy8gYm9vbDpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkJPT0w6XG4gICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlICE9IFwiYm9vbGVhblwiKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZW5jb2RlICR7ZmllbGR9IHRvIEpTT046ICR7KF9kID0gY2hlY2tGaWVsZChmaWVsZCwgdmFsdWUpKSA9PT0gbnVsbCB8fCBfZCA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2QubWVzc2FnZX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgLy8gSlNPTiB2YWx1ZSB3aWxsIGJlIGEgZGVjaW1hbCBzdHJpbmcuIEVpdGhlciBudW1iZXJzIG9yIHN0cmluZ3MgYXJlIGFjY2VwdGVkLlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuVUlOVDY0OlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRklYRUQ2NDpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLklOVDY0OlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0ZJWEVENjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TSU5UNjQ6XG4gICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlICE9IFwiYmlnaW50XCIgJiYgdHlwZW9mIHZhbHVlICE9IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGNhbm5vdCBlbmNvZGUgJHtmaWVsZH0gdG8gSlNPTjogJHsoX2UgPSBjaGVja0ZpZWxkKGZpZWxkLCB2YWx1ZSkpID09PSBudWxsIHx8IF9lID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfZS5tZXNzYWdlfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlLnRvU3RyaW5nKCk7XG4gICAgICAgIC8vIGJ5dGVzOiBKU09OIHZhbHVlIHdpbGwgYmUgdGhlIGRhdGEgZW5jb2RlZCBhcyBhIHN0cmluZyB1c2luZyBzdGFuZGFyZCBiYXNlNjQgZW5jb2Rpbmcgd2l0aCBwYWRkaW5ncy5cbiAgICAgICAgLy8gRWl0aGVyIHN0YW5kYXJkIG9yIFVSTC1zYWZlIGJhc2U2NCBlbmNvZGluZyB3aXRoL3dpdGhvdXQgcGFkZGluZ3MgYXJlIGFjY2VwdGVkLlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuQllURVM6XG4gICAgICAgICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBVaW50OEFycmF5KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGJhc2U2NEVuY29kZSh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGNhbm5vdCBlbmNvZGUgJHtmaWVsZH0gdG8gSlNPTjogJHsoX2YgPSBjaGVja0ZpZWxkKGZpZWxkLCB2YWx1ZSkpID09PSBudWxsIHx8IF9mID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfZi5tZXNzYWdlfWApO1xuICAgIH1cbn1cbmZ1bmN0aW9uIGpzb25OYW1lKGYsIG9wdHMpIHtcbiAgICByZXR1cm4gb3B0cy51c2VQcm90b0ZpZWxkTmFtZSA/IGYubmFtZSA6IGYuanNvbk5hbWU7XG59XG4vLyByZXR1cm5zIGEganNvbiB2YWx1ZSBpZiB3a3QsIG90aGVyd2lzZSByZXR1cm5zIHVuZGVmaW5lZC5cbmZ1bmN0aW9uIHRyeVdrdFRvSnNvbihtc2csIG9wdHMpIHtcbiAgICBpZiAoIW1zZy5kZXNjLnR5cGVOYW1lLnN0YXJ0c1dpdGgoXCJnb29nbGUucHJvdG9idWYuXCIpKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHN3aXRjaCAobXNnLmRlc2MudHlwZU5hbWUpIHtcbiAgICAgICAgY2FzZSBcImdvb2dsZS5wcm90b2J1Zi5BbnlcIjpcbiAgICAgICAgICAgIHJldHVybiBhbnlUb0pzb24obXNnLm1lc3NhZ2UsIG9wdHMpO1xuICAgICAgICBjYXNlIFwiZ29vZ2xlLnByb3RvYnVmLlRpbWVzdGFtcFwiOlxuICAgICAgICAgICAgcmV0dXJuIHRpbWVzdGFtcFRvSnNvbihtc2cubWVzc2FnZSk7XG4gICAgICAgIGNhc2UgXCJnb29nbGUucHJvdG9idWYuRHVyYXRpb25cIjpcbiAgICAgICAgICAgIHJldHVybiBkdXJhdGlvblRvSnNvbihtc2cubWVzc2FnZSk7XG4gICAgICAgIGNhc2UgXCJnb29nbGUucHJvdG9idWYuRmllbGRNYXNrXCI6XG4gICAgICAgICAgICByZXR1cm4gZmllbGRNYXNrVG9Kc29uKG1zZy5tZXNzYWdlKTtcbiAgICAgICAgY2FzZSBcImdvb2dsZS5wcm90b2J1Zi5TdHJ1Y3RcIjpcbiAgICAgICAgICAgIHJldHVybiBzdHJ1Y3RUb0pzb24obXNnLm1lc3NhZ2UpO1xuICAgICAgICBjYXNlIFwiZ29vZ2xlLnByb3RvYnVmLlZhbHVlXCI6XG4gICAgICAgICAgICByZXR1cm4gdmFsdWVUb0pzb24obXNnLm1lc3NhZ2UpO1xuICAgICAgICBjYXNlIFwiZ29vZ2xlLnByb3RvYnVmLkxpc3RWYWx1ZVwiOlxuICAgICAgICAgICAgcmV0dXJuIGxpc3RWYWx1ZVRvSnNvbihtc2cubWVzc2FnZSk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBpZiAoaXNXcmFwcGVyRGVzYyhtc2cuZGVzYykpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB2YWx1ZUZpZWxkID0gbXNnLmRlc2MuZmllbGRzWzBdO1xuICAgICAgICAgICAgICAgIHJldHVybiBzY2FsYXJUb0pzb24odmFsdWVGaWVsZCwgbXNnLmdldCh2YWx1ZUZpZWxkKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbn1cbmZ1bmN0aW9uIGFueVRvSnNvbih2YWwsIG9wdHMpIHtcbiAgICBpZiAodmFsLnR5cGVVcmwgPT09IFwiXCIpIHtcbiAgICAgICAgcmV0dXJuIHt9O1xuICAgIH1cbiAgICBjb25zdCB7IHJlZ2lzdHJ5IH0gPSBvcHRzO1xuICAgIGxldCBtZXNzYWdlO1xuICAgIGxldCBkZXNjO1xuICAgIGlmIChyZWdpc3RyeSkge1xuICAgICAgICBtZXNzYWdlID0gYW55VW5wYWNrKHZhbCwgcmVnaXN0cnkpO1xuICAgICAgICBpZiAobWVzc2FnZSkge1xuICAgICAgICAgICAgZGVzYyA9IHJlZ2lzdHJ5LmdldE1lc3NhZ2UobWVzc2FnZS4kdHlwZU5hbWUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmICghZGVzYyB8fCAhbWVzc2FnZSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGNhbm5vdCBlbmNvZGUgbWVzc2FnZSAke3ZhbC4kdHlwZU5hbWV9IHRvIEpTT046IFwiJHt2YWwudHlwZVVybH1cIiBpcyBub3QgaW4gdGhlIHR5cGUgcmVnaXN0cnlgKTtcbiAgICB9XG4gICAgbGV0IGpzb24gPSByZWZsZWN0VG9Kc29uKHJlZmxlY3QoZGVzYywgbWVzc2FnZSksIG9wdHMpO1xuICAgIGlmIChkZXNjLnR5cGVOYW1lLnN0YXJ0c1dpdGgoXCJnb29nbGUucHJvdG9idWYuXCIpIHx8XG4gICAgICAgIGpzb24gPT09IG51bGwgfHxcbiAgICAgICAgQXJyYXkuaXNBcnJheShqc29uKSB8fFxuICAgICAgICB0eXBlb2YganNvbiAhPT0gXCJvYmplY3RcIikge1xuICAgICAgICBqc29uID0geyB2YWx1ZToganNvbiB9O1xuICAgIH1cbiAgICBqc29uW1wiQHR5cGVcIl0gPSB2YWwudHlwZVVybDtcbiAgICByZXR1cm4ganNvbjtcbn1cbmZ1bmN0aW9uIGR1cmF0aW9uVG9Kc29uKHZhbCkge1xuICAgIGlmIChOdW1iZXIodmFsLnNlY29uZHMpID4gMzE1NTc2MDAwMDAwIHx8XG4gICAgICAgIE51bWJlcih2YWwuc2Vjb25kcykgPCAtMzE1NTc2MDAwMDAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGVuY29kZSBtZXNzYWdlICR7dmFsLiR0eXBlTmFtZX0gdG8gSlNPTjogdmFsdWUgb3V0IG9mIHJhbmdlYCk7XG4gICAgfVxuICAgIGxldCB0ZXh0ID0gdmFsLnNlY29uZHMudG9TdHJpbmcoKTtcbiAgICBpZiAodmFsLm5hbm9zICE9PSAwKSB7XG4gICAgICAgIGxldCBuYW5vc1N0ciA9IE1hdGguYWJzKHZhbC5uYW5vcykudG9TdHJpbmcoKTtcbiAgICAgICAgbmFub3NTdHIgPSBcIjBcIi5yZXBlYXQoOSAtIG5hbm9zU3RyLmxlbmd0aCkgKyBuYW5vc1N0cjtcbiAgICAgICAgaWYgKG5hbm9zU3RyLnN1YnN0cmluZygzKSA9PT0gXCIwMDAwMDBcIikge1xuICAgICAgICAgICAgbmFub3NTdHIgPSBuYW5vc1N0ci5zdWJzdHJpbmcoMCwgMyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAobmFub3NTdHIuc3Vic3RyaW5nKDYpID09PSBcIjAwMFwiKSB7XG4gICAgICAgICAgICBuYW5vc1N0ciA9IG5hbm9zU3RyLnN1YnN0cmluZygwLCA2KTtcbiAgICAgICAgfVxuICAgICAgICB0ZXh0ICs9IFwiLlwiICsgbmFub3NTdHI7XG4gICAgICAgIGlmICh2YWwubmFub3MgPCAwICYmIE51bWJlcih2YWwuc2Vjb25kcykgPT0gMCkge1xuICAgICAgICAgICAgdGV4dCA9IFwiLVwiICsgdGV4dDtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGV4dCArIFwic1wiO1xufVxuZnVuY3Rpb24gZmllbGRNYXNrVG9Kc29uKHZhbCkge1xuICAgIHJldHVybiB2YWwucGF0aHNcbiAgICAgICAgLm1hcCgocCkgPT4ge1xuICAgICAgICBpZiAocC5tYXRjaCgvX1swLTldP18vZykgfHwgcC5tYXRjaCgvW0EtWl0vZykpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGVuY29kZSBtZXNzYWdlICR7dmFsLiR0eXBlTmFtZX0gdG8gSlNPTjogbG93ZXJDYW1lbENhc2Ugb2YgcGF0aCBuYW1lIFwiYCArXG4gICAgICAgICAgICAgICAgcCArXG4gICAgICAgICAgICAgICAgJ1wiIGlzIGlycmV2ZXJzaWJsZScpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBwcm90b0NhbWVsQ2FzZShwKTtcbiAgICB9KVxuICAgICAgICAuam9pbihcIixcIik7XG59XG5mdW5jdGlvbiBzdHJ1Y3RUb0pzb24odmFsKSB7XG4gICAgY29uc3QganNvbiA9IHt9O1xuICAgIGZvciAoY29uc3QgW2ssIHZdIG9mIE9iamVjdC5lbnRyaWVzKHZhbC5maWVsZHMpKSB7XG4gICAgICAgIGpzb25ba10gPSB2YWx1ZVRvSnNvbih2KTtcbiAgICB9XG4gICAgcmV0dXJuIGpzb247XG59XG5mdW5jdGlvbiB2YWx1ZVRvSnNvbih2YWwpIHtcbiAgICBzd2l0Y2ggKHZhbC5raW5kLmNhc2UpIHtcbiAgICAgICAgY2FzZSBcIm51bGxWYWx1ZVwiOlxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIGNhc2UgXCJudW1iZXJWYWx1ZVwiOlxuICAgICAgICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUodmFsLmtpbmQudmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3ZhbC4kdHlwZU5hbWV9IGNhbm5vdCBiZSBOYU4gb3IgSW5maW5pdHlgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB2YWwua2luZC52YWx1ZTtcbiAgICAgICAgY2FzZSBcImJvb2xWYWx1ZVwiOlxuICAgICAgICAgICAgcmV0dXJuIHZhbC5raW5kLnZhbHVlO1xuICAgICAgICBjYXNlIFwic3RyaW5nVmFsdWVcIjpcbiAgICAgICAgICAgIHJldHVybiB2YWwua2luZC52YWx1ZTtcbiAgICAgICAgY2FzZSBcInN0cnVjdFZhbHVlXCI6XG4gICAgICAgICAgICByZXR1cm4gc3RydWN0VG9Kc29uKHZhbC5raW5kLnZhbHVlKTtcbiAgICAgICAgY2FzZSBcImxpc3RWYWx1ZVwiOlxuICAgICAgICAgICAgcmV0dXJuIGxpc3RWYWx1ZVRvSnNvbih2YWwua2luZC52YWx1ZSk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7dmFsLiR0eXBlTmFtZX0gbXVzdCBoYXZlIGEgdmFsdWVgKTtcbiAgICB9XG59XG5mdW5jdGlvbiBsaXN0VmFsdWVUb0pzb24odmFsKSB7XG4gICAgcmV0dXJuIHZhbC52YWx1ZXMubWFwKHZhbHVlVG9Kc29uKTtcbn1cbmZ1bmN0aW9uIHRpbWVzdGFtcFRvSnNvbih2YWwpIHtcbiAgICBjb25zdCBtcyA9IE51bWJlcih2YWwuc2Vjb25kcykgKiAxMDAwO1xuICAgIGlmIChtcyA8IERhdGUucGFyc2UoXCIwMDAxLTAxLTAxVDAwOjAwOjAwWlwiKSB8fFxuICAgICAgICBtcyA+IERhdGUucGFyc2UoXCI5OTk5LTEyLTMxVDIzOjU5OjU5WlwiKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGNhbm5vdCBlbmNvZGUgbWVzc2FnZSAke3ZhbC4kdHlwZU5hbWV9IHRvIEpTT046IG11c3QgYmUgZnJvbSAwMDAxLTAxLTAxVDAwOjAwOjAwWiB0byA5OTk5LTEyLTMxVDIzOjU5OjU5WiBpbmNsdXNpdmVgKTtcbiAgICB9XG4gICAgaWYgKHZhbC5uYW5vcyA8IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZW5jb2RlIG1lc3NhZ2UgJHt2YWwuJHR5cGVOYW1lfSB0byBKU09OOiBuYW5vcyBtdXN0IG5vdCBiZSBuZWdhdGl2ZWApO1xuICAgIH1cbiAgICBsZXQgeiA9IFwiWlwiO1xuICAgIGlmICh2YWwubmFub3MgPiAwKSB7XG4gICAgICAgIGNvbnN0IG5hbm9zU3RyID0gKHZhbC5uYW5vcyArIDEwMDAwMDAwMDApLnRvU3RyaW5nKCkuc3Vic3RyaW5nKDEpO1xuICAgICAgICBpZiAobmFub3NTdHIuc3Vic3RyaW5nKDMpID09PSBcIjAwMDAwMFwiKSB7XG4gICAgICAgICAgICB6ID0gXCIuXCIgKyBuYW5vc1N0ci5zdWJzdHJpbmcoMCwgMykgKyBcIlpcIjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChuYW5vc1N0ci5zdWJzdHJpbmcoNikgPT09IFwiMDAwXCIpIHtcbiAgICAgICAgICAgIHogPSBcIi5cIiArIG5hbm9zU3RyLnN1YnN0cmluZygwLCA2KSArIFwiWlwiO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgeiA9IFwiLlwiICsgbmFub3NTdHIgKyBcIlpcIjtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbmV3IERhdGUobXMpLnRvSVNPU3RyaW5nKCkucmVwbGFjZShcIi4wMDBaXCIsIHopO1xufVxuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5pbXBvcnQgeyBTY2FsYXJUeXBlLCB9IGZyb20gXCIuL2Rlc2NyaXB0b3JzLmpzXCI7XG5pbXBvcnQgeyBwcm90b0ludDY0IH0gZnJvbSBcIi4vcHJvdG8taW50NjQuanNcIjtcbmltcG9ydCB7IGNyZWF0ZSB9IGZyb20gXCIuL2NyZWF0ZS5qc1wiO1xuaW1wb3J0IHsgcmVmbGVjdCB9IGZyb20gXCIuL3JlZmxlY3QvcmVmbGVjdC5qc1wiO1xuaW1wb3J0IHsgRmllbGRFcnJvciwgaXNGaWVsZEVycm9yIH0gZnJvbSBcIi4vcmVmbGVjdC9lcnJvci5qc1wiO1xuaW1wb3J0IHsgZm9ybWF0VmFsIH0gZnJvbSBcIi4vcmVmbGVjdC9yZWZsZWN0LWNoZWNrLmpzXCI7XG5pbXBvcnQgeyBzY2FsYXJaZXJvVmFsdWUgfSBmcm9tIFwiLi9yZWZsZWN0L3NjYWxhci5qc1wiO1xuaW1wb3J0IHsgYmFzZTY0RGVjb2RlIH0gZnJvbSBcIi4vd2lyZS9iYXNlNjQtZW5jb2RpbmcuanNcIjtcbmltcG9ydCB7IGlzV3JhcHBlckRlc2MsIGFueVBhY2ssIExpc3RWYWx1ZVNjaGVtYSwgTnVsbFZhbHVlLCBTdHJ1Y3RTY2hlbWEsIFZhbHVlU2NoZW1hLCB9IGZyb20gXCIuL3drdC9pbmRleC5qc1wiO1xuaW1wb3J0IHsgY3JlYXRlRXh0ZW5zaW9uQ29udGFpbmVyLCBzZXRFeHRlbnNpb24gfSBmcm9tIFwiLi9leHRlbnNpb25zLmpzXCI7XG4vLyBEZWZhdWx0IG9wdGlvbnMgZm9yIHBhcnNpbmcgSlNPTi5cbmNvbnN0IGpzb25SZWFkRGVmYXVsdHMgPSB7XG4gICAgaWdub3JlVW5rbm93bkZpZWxkczogZmFsc2UsXG59O1xuZnVuY3Rpb24gbWFrZVJlYWRPcHRpb25zKG9wdGlvbnMpIHtcbiAgICByZXR1cm4gb3B0aW9ucyA/IE9iamVjdC5hc3NpZ24oT2JqZWN0LmFzc2lnbih7fSwganNvblJlYWREZWZhdWx0cyksIG9wdGlvbnMpIDoganNvblJlYWREZWZhdWx0cztcbn1cbi8qKlxuICogUGFyc2UgYSBtZXNzYWdlIGZyb20gYSBKU09OIHN0cmluZy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZyb21Kc29uU3RyaW5nKHNjaGVtYSwganNvbiwgb3B0aW9ucykge1xuICAgIHJldHVybiBmcm9tSnNvbihzY2hlbWEsIHBhcnNlSnNvblN0cmluZyhqc29uLCBzY2hlbWEudHlwZU5hbWUpLCBvcHRpb25zKTtcbn1cbi8qKlxuICogUGFyc2UgYSBtZXNzYWdlIGZyb20gYSBKU09OIHN0cmluZywgbWVyZ2luZyBmaWVsZHMuXG4gKlxuICogUmVwZWF0ZWQgZmllbGRzIGFyZSBhcHBlbmRlZC4gTWFwIGVudHJpZXMgYXJlIGFkZGVkLCBvdmVyd3JpdGluZ1xuICogZXhpc3Rpbmcga2V5cy5cbiAqXG4gKiBJZiBhIG1lc3NhZ2UgZmllbGQgaXMgYWxyZWFkeSBwcmVzZW50LCBpdCB3aWxsIGJlIG1lcmdlZCB3aXRoIHRoZVxuICogbmV3IGRhdGEuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZUZyb21Kc29uU3RyaW5nKHNjaGVtYSwgdGFyZ2V0LCBqc29uLCBvcHRpb25zKSB7XG4gICAgcmV0dXJuIG1lcmdlRnJvbUpzb24oc2NoZW1hLCB0YXJnZXQsIHBhcnNlSnNvblN0cmluZyhqc29uLCBzY2hlbWEudHlwZU5hbWUpLCBvcHRpb25zKTtcbn1cbi8qKlxuICogUGFyc2UgYSBtZXNzYWdlIGZyb20gYSBKU09OIHZhbHVlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZnJvbUpzb24oc2NoZW1hLCBqc29uLCBvcHRpb25zKSB7XG4gICAgY29uc3QgbXNnID0gcmVmbGVjdChzY2hlbWEpO1xuICAgIHRyeSB7XG4gICAgICAgIHJlYWRNZXNzYWdlKG1zZywganNvbiwgbWFrZVJlYWRPcHRpb25zKG9wdGlvbnMpKTtcbiAgICB9XG4gICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgaWYgKGlzRmllbGRFcnJvcihlKSkge1xuICAgICAgICAgICAgLy8gQHRzLWV4cGVjdC1lcnJvciB3ZSB1c2UgdGhlIEVTMjAyMiBlcnJvciBDVE9SIG9wdGlvbiBcImNhdXNlXCIgZm9yIGJldHRlciBzdGFjayB0cmFjZXNcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGRlY29kZSAke2UuZmllbGQoKX0gZnJvbSBKU09OOiAke2UubWVzc2FnZX1gLCB7XG4gICAgICAgICAgICAgICAgY2F1c2U6IGUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlO1xuICAgIH1cbiAgICByZXR1cm4gbXNnLm1lc3NhZ2U7XG59XG4vKipcbiAqIFBhcnNlIGEgbWVzc2FnZSBmcm9tIGEgSlNPTiB2YWx1ZSwgbWVyZ2luZyBmaWVsZHMuXG4gKlxuICogUmVwZWF0ZWQgZmllbGRzIGFyZSBhcHBlbmRlZC4gTWFwIGVudHJpZXMgYXJlIGFkZGVkLCBvdmVyd3JpdGluZ1xuICogZXhpc3Rpbmcga2V5cy5cbiAqXG4gKiBJZiBhIG1lc3NhZ2UgZmllbGQgaXMgYWxyZWFkeSBwcmVzZW50LCBpdCB3aWxsIGJlIG1lcmdlZCB3aXRoIHRoZVxuICogbmV3IGRhdGEuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZUZyb21Kc29uKHNjaGVtYSwgdGFyZ2V0LCBqc29uLCBvcHRpb25zKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgcmVhZE1lc3NhZ2UocmVmbGVjdChzY2hlbWEsIHRhcmdldCksIGpzb24sIG1ha2VSZWFkT3B0aW9ucyhvcHRpb25zKSk7XG4gICAgfVxuICAgIGNhdGNoIChlKSB7XG4gICAgICAgIGlmIChpc0ZpZWxkRXJyb3IoZSkpIHtcbiAgICAgICAgICAgIC8vIEB0cy1leHBlY3QtZXJyb3Igd2UgdXNlIHRoZSBFUzIwMjIgZXJyb3IgQ1RPUiBvcHRpb24gXCJjYXVzZVwiIGZvciBiZXR0ZXIgc3RhY2sgdHJhY2VzXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGNhbm5vdCBkZWNvZGUgJHtlLmZpZWxkKCl9IGZyb20gSlNPTjogJHtlLm1lc3NhZ2V9YCwge1xuICAgICAgICAgICAgICAgIGNhdXNlOiBlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZTtcbiAgICB9XG4gICAgcmV0dXJuIHRhcmdldDtcbn1cbi8qKlxuICogUGFyc2VzIGFuIGVudW0gdmFsdWUgZnJvbSBKU09OLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZW51bUZyb21Kc29uKGRlc2NFbnVtLCBqc29uKSB7XG4gICAgY29uc3QgdmFsID0gcmVhZEVudW0oZGVzY0VudW0sIGpzb24sIGZhbHNlLCBmYWxzZSk7XG4gICAgaWYgKHZhbCA9PT0gdG9rZW5JZ25vcmVkVW5rbm93bkVudW0pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZGVjb2RlICR7ZGVzY0VudW19IGZyb20gSlNPTjogJHtmb3JtYXRWYWwoanNvbil9YCk7XG4gICAgfVxuICAgIHJldHVybiB2YWw7XG59XG4vKipcbiAqIElzIHRoZSBnaXZlbiB2YWx1ZSBhIEpTT04gZW51bSB2YWx1ZT9cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzRW51bUpzb24oZGVzY0VudW0sIHZhbHVlKSB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZCAhPT0gZGVzY0VudW0udmFsdWVzLmZpbmQoKHYpID0+IHYubmFtZSA9PT0gdmFsdWUpO1xufVxuZnVuY3Rpb24gcmVhZE1lc3NhZ2UobXNnLCBqc29uLCBvcHRzKSB7XG4gICAgdmFyIF9hO1xuICAgIGlmICh0cnlXa3RGcm9tSnNvbihtc2csIGpzb24sIG9wdHMpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGpzb24gPT0gbnVsbCB8fCBBcnJheS5pc0FycmF5KGpzb24pIHx8IHR5cGVvZiBqc29uICE9IFwib2JqZWN0XCIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZGVjb2RlICR7bXNnLmRlc2N9IGZyb20gSlNPTjogJHtmb3JtYXRWYWwoanNvbil9YCk7XG4gICAgfVxuICAgIGNvbnN0IG9uZW9mU2VlbiA9IG5ldyBNYXAoKTtcbiAgICBjb25zdCBqc29uTmFtZXMgPSBuZXcgTWFwKCk7XG4gICAgZm9yIChjb25zdCBmaWVsZCBvZiBtc2cuZGVzYy5maWVsZHMpIHtcbiAgICAgICAganNvbk5hbWVzLnNldChmaWVsZC5uYW1lLCBmaWVsZCkuc2V0KGZpZWxkLmpzb25OYW1lLCBmaWVsZCk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgW2pzb25LZXksIGpzb25WYWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoanNvbikpIHtcbiAgICAgICAgY29uc3QgZmllbGQgPSBqc29uTmFtZXMuZ2V0KGpzb25LZXkpO1xuICAgICAgICBpZiAoZmllbGQpIHtcbiAgICAgICAgICAgIGlmIChmaWVsZC5vbmVvZikge1xuICAgICAgICAgICAgICAgIGlmIChqc29uVmFsdWUgPT09IG51bGwgJiYgZmllbGQuZmllbGRLaW5kID09IFwic2NhbGFyXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gc2VlIGNvbmZvcm1hbmNlIHRlc3QgUmVxdWlyZWQuUHJvdG8zLkpzb25JbnB1dC5PbmVvZkZpZWxkTnVsbHtGaXJzdCxTZWNvbmR9XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBzZWVuID0gb25lb2ZTZWVuLmdldChmaWVsZC5vbmVvZik7XG4gICAgICAgICAgICAgICAgaWYgKHNlZW4gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRmllbGRFcnJvcihmaWVsZC5vbmVvZiwgYG9uZW9mIHNldCBtdWx0aXBsZSB0aW1lcyBieSAke3NlZW4ubmFtZX0gYW5kICR7ZmllbGQubmFtZX1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgb25lb2ZTZWVuLnNldChmaWVsZC5vbmVvZiwgZmllbGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVhZEZpZWxkKG1zZywgZmllbGQsIGpzb25WYWx1ZSwgb3B0cyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBsZXQgZXh0ZW5zaW9uID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgaWYgKGpzb25LZXkuc3RhcnRzV2l0aChcIltcIikgJiZcbiAgICAgICAgICAgICAgICBqc29uS2V5LmVuZHNXaXRoKFwiXVwiKSAmJlxuICAgICAgICAgICAgICAgIC8vIGJpb21lLWlnbm9yZSBsaW50L3N1c3BpY2lvdXMvbm9Bc3NpZ25JbkV4cHJlc3Npb25zOiBub1xuICAgICAgICAgICAgICAgIChleHRlbnNpb24gPSAoX2EgPSBvcHRzLnJlZ2lzdHJ5KSA9PT0gbnVsbCB8fCBfYSA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2EuZ2V0RXh0ZW5zaW9uKGpzb25LZXkuc3Vic3RyaW5nKDEsIGpzb25LZXkubGVuZ3RoIC0gMSkpKSAmJlxuICAgICAgICAgICAgICAgIGV4dGVuc2lvbi5leHRlbmRlZS50eXBlTmFtZSA9PT0gbXNnLmRlc2MudHlwZU5hbWUpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBbY29udGFpbmVyLCBmaWVsZCwgZ2V0XSA9IGNyZWF0ZUV4dGVuc2lvbkNvbnRhaW5lcihleHRlbnNpb24pO1xuICAgICAgICAgICAgICAgIHJlYWRGaWVsZChjb250YWluZXIsIGZpZWxkLCBqc29uVmFsdWUsIG9wdHMpO1xuICAgICAgICAgICAgICAgIHNldEV4dGVuc2lvbihtc2cubWVzc2FnZSwgZXh0ZW5zaW9uLCBnZXQoKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIWV4dGVuc2lvbiAmJiAhb3B0cy5pZ25vcmVVbmtub3duRmllbGRzKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZGVjb2RlICR7bXNnLmRlc2N9IGZyb20gSlNPTjoga2V5IFwiJHtqc29uS2V5fVwiIGlzIHVua25vd25gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cbmZ1bmN0aW9uIHJlYWRGaWVsZChtc2csIGZpZWxkLCBqc29uLCBvcHRzKSB7XG4gICAgc3dpdGNoIChmaWVsZC5maWVsZEtpbmQpIHtcbiAgICAgICAgY2FzZSBcInNjYWxhclwiOlxuICAgICAgICAgICAgcmVhZFNjYWxhckZpZWxkKG1zZywgZmllbGQsIGpzb24pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJlbnVtXCI6XG4gICAgICAgICAgICByZWFkRW51bUZpZWxkKG1zZywgZmllbGQsIGpzb24sIG9wdHMpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJtZXNzYWdlXCI6XG4gICAgICAgICAgICByZWFkTWVzc2FnZUZpZWxkKG1zZywgZmllbGQsIGpzb24sIG9wdHMpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJsaXN0XCI6XG4gICAgICAgICAgICByZWFkTGlzdEZpZWxkKG1zZy5nZXQoZmllbGQpLCBqc29uLCBvcHRzKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwibWFwXCI6XG4gICAgICAgICAgICByZWFkTWFwRmllbGQobXNnLmdldChmaWVsZCksIGpzb24sIG9wdHMpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxufVxuZnVuY3Rpb24gcmVhZE1hcEZpZWxkKG1hcCwganNvbiwgb3B0cykge1xuICAgIGlmIChqc29uID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgZmllbGQgPSBtYXAuZmllbGQoKTtcbiAgICBpZiAodHlwZW9mIGpzb24gIT0gXCJvYmplY3RcIiB8fCBBcnJheS5pc0FycmF5KGpzb24pKSB7XG4gICAgICAgIHRocm93IG5ldyBGaWVsZEVycm9yKGZpZWxkLCBcImV4cGVjdGVkIG9iamVjdCwgZ290IFwiICsgZm9ybWF0VmFsKGpzb24pKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBbanNvbk1hcEtleSwganNvbk1hcFZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhqc29uKSkge1xuICAgICAgICBpZiAoanNvbk1hcFZhbHVlID09PSBudWxsKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRmllbGRFcnJvcihmaWVsZCwgXCJtYXAgdmFsdWUgbXVzdCBub3QgYmUgbnVsbFwiKTtcbiAgICAgICAgfVxuICAgICAgICBsZXQgdmFsdWU7XG4gICAgICAgIHN3aXRjaCAoZmllbGQubWFwS2luZCkge1xuICAgICAgICAgICAgY2FzZSBcIm1lc3NhZ2VcIjpcbiAgICAgICAgICAgICAgICBjb25zdCBtc2dWYWx1ZSA9IHJlZmxlY3QoZmllbGQubWVzc2FnZSk7XG4gICAgICAgICAgICAgICAgcmVhZE1lc3NhZ2UobXNnVmFsdWUsIGpzb25NYXBWYWx1ZSwgb3B0cyk7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSBtc2dWYWx1ZTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJlbnVtXCI6XG4gICAgICAgICAgICAgICAgdmFsdWUgPSByZWFkRW51bShmaWVsZC5lbnVtLCBqc29uTWFwVmFsdWUsIG9wdHMuaWdub3JlVW5rbm93bkZpZWxkcywgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlID09PSB0b2tlbklnbm9yZWRVbmtub3duRW51bSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcInNjYWxhclwiOlxuICAgICAgICAgICAgICAgIHZhbHVlID0gc2NhbGFyRnJvbUpzb24oZmllbGQsIGpzb25NYXBWYWx1ZSwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qga2V5ID0gbWFwS2V5RnJvbUpzb24oZmllbGQubWFwS2V5LCBqc29uTWFwS2V5KTtcbiAgICAgICAgbWFwLnNldChrZXksIHZhbHVlKTtcbiAgICB9XG59XG5mdW5jdGlvbiByZWFkTGlzdEZpZWxkKGxpc3QsIGpzb24sIG9wdHMpIHtcbiAgICBpZiAoanNvbiA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGZpZWxkID0gbGlzdC5maWVsZCgpO1xuICAgIGlmICghQXJyYXkuaXNBcnJheShqc29uKSkge1xuICAgICAgICB0aHJvdyBuZXcgRmllbGRFcnJvcihmaWVsZCwgXCJleHBlY3RlZCBBcnJheSwgZ290IFwiICsgZm9ybWF0VmFsKGpzb24pKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBqc29uSXRlbSBvZiBqc29uKSB7XG4gICAgICAgIGlmIChqc29uSXRlbSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEZpZWxkRXJyb3IoZmllbGQsIFwibGlzdCBpdGVtIG11c3Qgbm90IGJlIG51bGxcIik7XG4gICAgICAgIH1cbiAgICAgICAgc3dpdGNoIChmaWVsZC5saXN0S2luZCkge1xuICAgICAgICAgICAgY2FzZSBcIm1lc3NhZ2VcIjpcbiAgICAgICAgICAgICAgICBjb25zdCBtc2dWYWx1ZSA9IHJlZmxlY3QoZmllbGQubWVzc2FnZSk7XG4gICAgICAgICAgICAgICAgcmVhZE1lc3NhZ2UobXNnVmFsdWUsIGpzb25JdGVtLCBvcHRzKTtcbiAgICAgICAgICAgICAgICBsaXN0LmFkZChtc2dWYWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiZW51bVwiOlxuICAgICAgICAgICAgICAgIGNvbnN0IGVudW1WYWx1ZSA9IHJlYWRFbnVtKGZpZWxkLmVudW0sIGpzb25JdGVtLCBvcHRzLmlnbm9yZVVua25vd25GaWVsZHMsIHRydWUpO1xuICAgICAgICAgICAgICAgIGlmIChlbnVtVmFsdWUgIT09IHRva2VuSWdub3JlZFVua25vd25FbnVtKSB7XG4gICAgICAgICAgICAgICAgICAgIGxpc3QuYWRkKGVudW1WYWx1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcInNjYWxhclwiOlxuICAgICAgICAgICAgICAgIGxpc3QuYWRkKHNjYWxhckZyb21Kc29uKGZpZWxkLCBqc29uSXRlbSwgdHJ1ZSkpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxufVxuZnVuY3Rpb24gcmVhZE1lc3NhZ2VGaWVsZChtc2csIGZpZWxkLCBqc29uLCBvcHRzKSB7XG4gICAgaWYgKGpzb24gPT09IG51bGwgJiYgZmllbGQubWVzc2FnZS50eXBlTmFtZSAhPSBcImdvb2dsZS5wcm90b2J1Zi5WYWx1ZVwiKSB7XG4gICAgICAgIG1zZy5jbGVhcihmaWVsZCk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgbXNnVmFsdWUgPSBtc2cuaXNTZXQoZmllbGQpID8gbXNnLmdldChmaWVsZCkgOiByZWZsZWN0KGZpZWxkLm1lc3NhZ2UpO1xuICAgIHJlYWRNZXNzYWdlKG1zZ1ZhbHVlLCBqc29uLCBvcHRzKTtcbiAgICBtc2cuc2V0KGZpZWxkLCBtc2dWYWx1ZSk7XG59XG5mdW5jdGlvbiByZWFkRW51bUZpZWxkKG1zZywgZmllbGQsIGpzb24sIG9wdHMpIHtcbiAgICBjb25zdCBlbnVtVmFsdWUgPSByZWFkRW51bShmaWVsZC5lbnVtLCBqc29uLCBvcHRzLmlnbm9yZVVua25vd25GaWVsZHMsIGZhbHNlKTtcbiAgICBpZiAoZW51bVZhbHVlID09PSB0b2tlbk51bGwpIHtcbiAgICAgICAgbXNnLmNsZWFyKGZpZWxkKTtcbiAgICB9XG4gICAgZWxzZSBpZiAoZW51bVZhbHVlICE9PSB0b2tlbklnbm9yZWRVbmtub3duRW51bSkge1xuICAgICAgICBtc2cuc2V0KGZpZWxkLCBlbnVtVmFsdWUpO1xuICAgIH1cbn1cbmZ1bmN0aW9uIHJlYWRTY2FsYXJGaWVsZChtc2csIGZpZWxkLCBqc29uKSB7XG4gICAgY29uc3Qgc2NhbGFyVmFsdWUgPSBzY2FsYXJGcm9tSnNvbihmaWVsZCwganNvbiwgZmFsc2UpO1xuICAgIGlmIChzY2FsYXJWYWx1ZSA9PT0gdG9rZW5OdWxsKSB7XG4gICAgICAgIG1zZy5jbGVhcihmaWVsZCk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBtc2cuc2V0KGZpZWxkLCBzY2FsYXJWYWx1ZSk7XG4gICAgfVxufVxuY29uc3QgdG9rZW5JZ25vcmVkVW5rbm93bkVudW0gPSBTeW1ib2woKTtcbmZ1bmN0aW9uIHJlYWRFbnVtKGRlc2MsIGpzb24sIGlnbm9yZVVua25vd25GaWVsZHMsIG51bGxBc1plcm9WYWx1ZSkge1xuICAgIGlmIChqc29uID09PSBudWxsKSB7XG4gICAgICAgIGlmIChkZXNjLnR5cGVOYW1lID09IFwiZ29vZ2xlLnByb3RvYnVmLk51bGxWYWx1ZVwiKSB7XG4gICAgICAgICAgICByZXR1cm4gMDsgLy8gZ29vZ2xlLnByb3RvYnVmLk51bGxWYWx1ZS5OVUxMX1ZBTFVFID0gMFxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsQXNaZXJvVmFsdWUgPyBkZXNjLnZhbHVlc1swXS5udW1iZXIgOiB0b2tlbk51bGw7XG4gICAgfVxuICAgIHN3aXRjaCAodHlwZW9mIGpzb24pIHtcbiAgICAgICAgY2FzZSBcIm51bWJlclwiOlxuICAgICAgICAgICAgaWYgKE51bWJlci5pc0ludGVnZXIoanNvbikpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ganNvbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwic3RyaW5nXCI6XG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IGRlc2MudmFsdWVzLmZpbmQoKGV2KSA9PiBldi5uYW1lID09PSBqc29uKTtcbiAgICAgICAgICAgIGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLm51bWJlcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpZ25vcmVVbmtub3duRmllbGRzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRva2VuSWdub3JlZFVua25vd25FbnVtO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGRlY29kZSAke2Rlc2N9IGZyb20gSlNPTjogJHtmb3JtYXRWYWwoanNvbil9YCk7XG59XG5jb25zdCB0b2tlbk51bGwgPSBTeW1ib2woKTtcbmZ1bmN0aW9uIHNjYWxhckZyb21Kc29uKGZpZWxkLCBqc29uLCBudWxsQXNaZXJvVmFsdWUpIHtcbiAgICBpZiAoanNvbiA9PT0gbnVsbCkge1xuICAgICAgICBpZiAobnVsbEFzWmVyb1ZhbHVlKSB7XG4gICAgICAgICAgICByZXR1cm4gc2NhbGFyWmVyb1ZhbHVlKGZpZWxkLnNjYWxhciwgZmFsc2UpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0b2tlbk51bGw7XG4gICAgfVxuICAgIC8vIGludDY0LCBzZml4ZWQ2NCwgc2ludDY0LCBmaXhlZDY0LCB1aW50NjQ6IFJlZmxlY3Qgc3VwcG9ydHMgc3RyaW5nIGFuZCBudW1iZXIuXG4gICAgLy8gc3RyaW5nLCBib29sOiBTdXBwb3J0ZWQgYnkgcmVmbGVjdC5cbiAgICBzd2l0Y2ggKGZpZWxkLnNjYWxhcikge1xuICAgICAgICAvLyBmbG9hdCwgZG91YmxlOiBKU09OIHZhbHVlIHdpbGwgYmUgYSBudW1iZXIgb3Igb25lIG9mIHRoZSBzcGVjaWFsIHN0cmluZyB2YWx1ZXMgXCJOYU5cIiwgXCJJbmZpbml0eVwiLCBhbmQgXCItSW5maW5pdHlcIi5cbiAgICAgICAgLy8gRWl0aGVyIG51bWJlcnMgb3Igc3RyaW5ncyBhcmUgYWNjZXB0ZWQuIEV4cG9uZW50IG5vdGF0aW9uIGlzIGFsc28gYWNjZXB0ZWQuXG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5ET1VCTEU6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5GTE9BVDpcbiAgICAgICAgICAgIGlmIChqc29uID09PSBcIk5hTlwiKVxuICAgICAgICAgICAgICAgIHJldHVybiBOYU47XG4gICAgICAgICAgICBpZiAoanNvbiA9PT0gXCJJbmZpbml0eVwiKVxuICAgICAgICAgICAgICAgIHJldHVybiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG4gICAgICAgICAgICBpZiAoanNvbiA9PT0gXCItSW5maW5pdHlcIilcbiAgICAgICAgICAgICAgICByZXR1cm4gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBqc29uID09IFwibnVtYmVyXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoTnVtYmVyLmlzTmFOKGpzb24pKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIE5hTiBtdXN0IGJlIGVuY29kZWQgd2l0aCBzdHJpbmcgY29uc3RhbnRzXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBGaWVsZEVycm9yKGZpZWxkLCBcInVuZXhwZWN0ZWQgTmFOIG51bWJlclwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoanNvbikpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gSW5maW5pdHkgbXVzdCBiZSBlbmNvZGVkIHdpdGggc3RyaW5nIGNvbnN0YW50c1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRmllbGRFcnJvcihmaWVsZCwgXCJ1bmV4cGVjdGVkIGluZmluaXRlIG51bWJlclwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodHlwZW9mIGpzb24gPT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIGlmIChqc29uID09PSBcIlwiKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGVtcHR5IHN0cmluZyBpcyBub3QgYSBudW1iZXJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChqc29uLnRyaW0oKS5sZW5ndGggIT09IGpzb24ubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGV4dHJhIHdoaXRlc3BhY2VcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IGZsb2F0ID0gTnVtYmVyKGpzb24pO1xuICAgICAgICAgICAgICAgIGlmICghTnVtYmVyLmlzRmluaXRlKGZsb2F0KSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBJbmZpbml0eSBhbmQgTmFOIG11c3QgYmUgZW5jb2RlZCB3aXRoIHN0cmluZyBjb25zdGFudHNcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBmbG9hdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAvLyBpbnQzMiwgZml4ZWQzMiwgdWludDMyOiBKU09OIHZhbHVlIHdpbGwgYmUgYSBkZWNpbWFsIG51bWJlci4gRWl0aGVyIG51bWJlcnMgb3Igc3RyaW5ncyBhcmUgYWNjZXB0ZWQuXG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5JTlQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZJWEVEMzI6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TRklYRUQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNJTlQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlVJTlQzMjpcbiAgICAgICAgICAgIHJldHVybiBpbnQzMkZyb21Kc29uKGpzb24pO1xuICAgICAgICAvLyBieXRlczogSlNPTiB2YWx1ZSB3aWxsIGJlIHRoZSBkYXRhIGVuY29kZWQgYXMgYSBzdHJpbmcgdXNpbmcgc3RhbmRhcmQgYmFzZTY0IGVuY29kaW5nIHdpdGggcGFkZGluZ3MuXG4gICAgICAgIC8vIEVpdGhlciBzdGFuZGFyZCBvciBVUkwtc2FmZSBiYXNlNjQgZW5jb2Rpbmcgd2l0aC93aXRob3V0IHBhZGRpbmdzIGFyZSBhY2NlcHRlZC5cbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkJZVEVTOlxuICAgICAgICAgICAgaWYgKHR5cGVvZiBqc29uID09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoanNvbiA9PT0gXCJcIikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFVpbnQ4QXJyYXkoMCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBiYXNlNjREZWNvZGUoanNvbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSk7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBGaWVsZEVycm9yKGZpZWxkLCBtZXNzYWdlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIGpzb247XG59XG4vKipcbiAqIFRyeSB0byBwYXJzZSBhIEpTT04gdmFsdWUgdG8gYSBtYXAga2V5IGZvciB0aGUgcmVmbGVjdCBBUEkuXG4gKlxuICogUmV0dXJucyB0aGUgaW5wdXQgaWYgdGhlIEpTT04gdmFsdWUgY2Fubm90IGJlIGNvbnZlcnRlZC5cbiAqL1xuZnVuY3Rpb24gbWFwS2V5RnJvbUpzb24odHlwZSwganNvbikge1xuICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuQk9PTDpcbiAgICAgICAgICAgIHN3aXRjaCAoanNvbikge1xuICAgICAgICAgICAgICAgIGNhc2UgXCJ0cnVlXCI6XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIGNhc2UgXCJmYWxzZVwiOlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ganNvbjtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLklOVDMyOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRklYRUQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlVJTlQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNGSVhFRDMyOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0lOVDMyOlxuICAgICAgICAgICAgcmV0dXJuIGludDMyRnJvbUpzb24oanNvbik7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4ganNvbjtcbiAgICB9XG59XG4vKipcbiAqIFRyeSB0byBwYXJzZSBhIEpTT04gdmFsdWUgdG8gYSAzMi1iaXQgaW50ZWdlciBmb3IgdGhlIHJlZmxlY3QgQVBJLlxuICpcbiAqIFJldHVybnMgdGhlIGlucHV0IGlmIHRoZSBKU09OIHZhbHVlIGNhbm5vdCBiZSBjb252ZXJ0ZWQuXG4gKi9cbmZ1bmN0aW9uIGludDMyRnJvbUpzb24oanNvbikge1xuICAgIGlmICh0eXBlb2YganNvbiA9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIGlmIChqc29uID09PSBcIlwiKSB7XG4gICAgICAgICAgICAvLyBlbXB0eSBzdHJpbmcgaXMgbm90IGEgbnVtYmVyXG4gICAgICAgICAgICByZXR1cm4ganNvbjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvbi50cmltKCkubGVuZ3RoICE9PSBqc29uLmxlbmd0aCkge1xuICAgICAgICAgICAgLy8gZXh0cmEgd2hpdGVzcGFjZVxuICAgICAgICAgICAgcmV0dXJuIGpzb247XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgbnVtID0gTnVtYmVyKGpzb24pO1xuICAgICAgICBpZiAoTnVtYmVyLmlzTmFOKG51bSkpIHtcbiAgICAgICAgICAgIC8vIG5vdCBhIG51bWJlclxuICAgICAgICAgICAgcmV0dXJuIGpzb247XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bTtcbiAgICB9XG4gICAgcmV0dXJuIGpzb247XG59XG5mdW5jdGlvbiBwYXJzZUpzb25TdHJpbmcoanNvblN0cmluZywgdHlwZU5hbWUpIHtcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShqc29uU3RyaW5nKTtcbiAgICB9XG4gICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc3QgbWVzc2FnZSA9IGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IFN0cmluZyhlKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZGVjb2RlIG1lc3NhZ2UgJHt0eXBlTmFtZX0gZnJvbSBKU09OOiAke21lc3NhZ2V9YCwgXG4gICAgICAgIC8vIEB0cy1leHBlY3QtZXJyb3Igd2UgdXNlIHRoZSBFUzIwMjIgZXJyb3IgQ1RPUiBvcHRpb24gXCJjYXVzZVwiIGZvciBiZXR0ZXIgc3RhY2sgdHJhY2VzXG4gICAgICAgIHsgY2F1c2U6IGUgfSk7XG4gICAgfVxufVxuZnVuY3Rpb24gdHJ5V2t0RnJvbUpzb24obXNnLCBqc29uVmFsdWUsIG9wdHMpIHtcbiAgICBpZiAoIW1zZy5kZXNjLnR5cGVOYW1lLnN0YXJ0c1dpdGgoXCJnb29nbGUucHJvdG9idWYuXCIpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgc3dpdGNoIChtc2cuZGVzYy50eXBlTmFtZSkge1xuICAgICAgICBjYXNlIFwiZ29vZ2xlLnByb3RvYnVmLkFueVwiOlxuICAgICAgICAgICAgYW55RnJvbUpzb24obXNnLm1lc3NhZ2UsIGpzb25WYWx1ZSwgb3B0cyk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgY2FzZSBcImdvb2dsZS5wcm90b2J1Zi5UaW1lc3RhbXBcIjpcbiAgICAgICAgICAgIHRpbWVzdGFtcEZyb21Kc29uKG1zZy5tZXNzYWdlLCBqc29uVmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGNhc2UgXCJnb29nbGUucHJvdG9idWYuRHVyYXRpb25cIjpcbiAgICAgICAgICAgIGR1cmF0aW9uRnJvbUpzb24obXNnLm1lc3NhZ2UsIGpzb25WYWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgY2FzZSBcImdvb2dsZS5wcm90b2J1Zi5GaWVsZE1hc2tcIjpcbiAgICAgICAgICAgIGZpZWxkTWFza0Zyb21Kc29uKG1zZy5tZXNzYWdlLCBqc29uVmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGNhc2UgXCJnb29nbGUucHJvdG9idWYuU3RydWN0XCI6XG4gICAgICAgICAgICBzdHJ1Y3RGcm9tSnNvbihtc2cubWVzc2FnZSwganNvblZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICBjYXNlIFwiZ29vZ2xlLnByb3RvYnVmLlZhbHVlXCI6XG4gICAgICAgICAgICB2YWx1ZUZyb21Kc29uKG1zZy5tZXNzYWdlLCBqc29uVmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGNhc2UgXCJnb29nbGUucHJvdG9idWYuTGlzdFZhbHVlXCI6XG4gICAgICAgICAgICBsaXN0VmFsdWVGcm9tSnNvbihtc2cubWVzc2FnZSwganNvblZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgaWYgKGlzV3JhcHBlckRlc2MobXNnLmRlc2MpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdmFsdWVGaWVsZCA9IG1zZy5kZXNjLmZpZWxkc1swXTtcbiAgICAgICAgICAgICAgICBpZiAoanNvblZhbHVlID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIG1zZy5jbGVhcih2YWx1ZUZpZWxkKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIG1zZy5zZXQodmFsdWVGaWVsZCwgc2NhbGFyRnJvbUpzb24odmFsdWVGaWVsZCwganNvblZhbHVlLCB0cnVlKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cbmZ1bmN0aW9uIGFueUZyb21Kc29uKGFueSwganNvbiwgb3B0cykge1xuICAgIHZhciBfYTtcbiAgICBpZiAoanNvbiA9PT0gbnVsbCB8fCBBcnJheS5pc0FycmF5KGpzb24pIHx8IHR5cGVvZiBqc29uICE9IFwib2JqZWN0XCIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZGVjb2RlIG1lc3NhZ2UgJHthbnkuJHR5cGVOYW1lfSBmcm9tIEpTT046IGV4cGVjdGVkIG9iamVjdCBidXQgZ290ICR7Zm9ybWF0VmFsKGpzb24pfWApO1xuICAgIH1cbiAgICBpZiAoT2JqZWN0LmtleXMoanNvbikubGVuZ3RoID09IDApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB0eXBlVXJsID0ganNvbltcIkB0eXBlXCJdO1xuICAgIGlmICh0eXBlb2YgdHlwZVVybCAhPSBcInN0cmluZ1wiIHx8IHR5cGVVcmwgPT0gXCJcIikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGNhbm5vdCBkZWNvZGUgbWVzc2FnZSAke2FueS4kdHlwZU5hbWV9IGZyb20gSlNPTjogXCJAdHlwZVwiIGlzIGVtcHR5YCk7XG4gICAgfVxuICAgIGNvbnN0IHR5cGVOYW1lID0gdHlwZVVybC5pbmNsdWRlcyhcIi9cIilcbiAgICAgICAgPyB0eXBlVXJsLnN1YnN0cmluZyh0eXBlVXJsLmxhc3RJbmRleE9mKFwiL1wiKSArIDEpXG4gICAgICAgIDogdHlwZVVybDtcbiAgICBpZiAoIXR5cGVOYW1lLmxlbmd0aCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGNhbm5vdCBkZWNvZGUgbWVzc2FnZSAke2FueS4kdHlwZU5hbWV9IGZyb20gSlNPTjogXCJAdHlwZVwiIGlzIGludmFsaWRgKTtcbiAgICB9XG4gICAgY29uc3QgZGVzYyA9IChfYSA9IG9wdHMucmVnaXN0cnkpID09PSBudWxsIHx8IF9hID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfYS5nZXRNZXNzYWdlKHR5cGVOYW1lKTtcbiAgICBpZiAoIWRlc2MpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZGVjb2RlIG1lc3NhZ2UgJHthbnkuJHR5cGVOYW1lfSBmcm9tIEpTT046ICR7dHlwZVVybH0gaXMgbm90IGluIHRoZSB0eXBlIHJlZ2lzdHJ5YCk7XG4gICAgfVxuICAgIGNvbnN0IG1zZyA9IHJlZmxlY3QoZGVzYyk7XG4gICAgaWYgKHR5cGVOYW1lLnN0YXJ0c1dpdGgoXCJnb29nbGUucHJvdG9idWYuXCIpICYmXG4gICAgICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChqc29uLCBcInZhbHVlXCIpKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0ganNvbi52YWx1ZTtcbiAgICAgICAgcmVhZE1lc3NhZ2UobXNnLCB2YWx1ZSwgb3B0cyk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBjb25zdCBjb3B5ID0gT2JqZWN0LmFzc2lnbih7fSwganNvbik7XG4gICAgICAgIC8vIGJpb21lLWlnbm9yZSBsaW50L3BlcmZvcm1hbmNlL25vRGVsZXRlOiA8ZXhwbGFuYXRpb24+XG4gICAgICAgIGRlbGV0ZSBjb3B5W1wiQHR5cGVcIl07XG4gICAgICAgIHJlYWRNZXNzYWdlKG1zZywgY29weSwgb3B0cyk7XG4gICAgfVxuICAgIGFueVBhY2sobXNnLmRlc2MsIG1zZy5tZXNzYWdlLCBhbnkpO1xufVxuZnVuY3Rpb24gdGltZXN0YW1wRnJvbUpzb24odGltZXN0YW1wLCBqc29uKSB7XG4gICAgaWYgKHR5cGVvZiBqc29uICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGRlY29kZSBtZXNzYWdlICR7dGltZXN0YW1wLiR0eXBlTmFtZX0gZnJvbSBKU09OOiAke2Zvcm1hdFZhbChqc29uKX1gKTtcbiAgICB9XG4gICAgY29uc3QgbWF0Y2hlcyA9IGpzb24ubWF0Y2goL14oWzAtOV17NH0pLShbMC05XXsyfSktKFswLTldezJ9KVQoWzAtOV17Mn0pOihbMC05XXsyfSk6KFswLTldezJ9KSg/OlxcLihbMC05XXsxLDl9KSk/KD86WnwoWystXVswLTldWzAtOV06WzAtOV1bMC05XSkpJC8pO1xuICAgIGlmICghbWF0Y2hlcykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGNhbm5vdCBkZWNvZGUgbWVzc2FnZSAke3RpbWVzdGFtcC4kdHlwZU5hbWV9IGZyb20gSlNPTjogaW52YWxpZCBSRkMgMzMzOSBzdHJpbmdgKTtcbiAgICB9XG4gICAgY29uc3QgbXMgPSBEYXRlLnBhcnNlKFxuICAgIC8vIGJpb21lLWlnbm9yZSBmb3JtYXQ6IHdhbnQgdGhpcyB0byByZWFkIHdlbGxcbiAgICBtYXRjaGVzWzFdICsgXCItXCIgKyBtYXRjaGVzWzJdICsgXCItXCIgKyBtYXRjaGVzWzNdICsgXCJUXCIgKyBtYXRjaGVzWzRdICsgXCI6XCIgKyBtYXRjaGVzWzVdICsgXCI6XCIgKyBtYXRjaGVzWzZdICsgKG1hdGNoZXNbOF0gPyBtYXRjaGVzWzhdIDogXCJaXCIpKTtcbiAgICBpZiAoTnVtYmVyLmlzTmFOKG1zKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGNhbm5vdCBkZWNvZGUgbWVzc2FnZSAke3RpbWVzdGFtcC4kdHlwZU5hbWV9IGZyb20gSlNPTjogaW52YWxpZCBSRkMgMzMzOSBzdHJpbmdgKTtcbiAgICB9XG4gICAgaWYgKG1zIDwgRGF0ZS5wYXJzZShcIjAwMDEtMDEtMDFUMDA6MDA6MDBaXCIpIHx8XG4gICAgICAgIG1zID4gRGF0ZS5wYXJzZShcIjk5OTktMTItMzFUMjM6NTk6NTlaXCIpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGRlY29kZSBtZXNzYWdlICR7dGltZXN0YW1wLiR0eXBlTmFtZX0gZnJvbSBKU09OOiBtdXN0IGJlIGZyb20gMDAwMS0wMS0wMVQwMDowMDowMFogdG8gOTk5OS0xMi0zMVQyMzo1OTo1OVogaW5jbHVzaXZlYCk7XG4gICAgfVxuICAgIHRpbWVzdGFtcC5zZWNvbmRzID0gcHJvdG9JbnQ2NC5wYXJzZShtcyAvIDEwMDApO1xuICAgIHRpbWVzdGFtcC5uYW5vcyA9IDA7XG4gICAgaWYgKG1hdGNoZXNbN10pIHtcbiAgICAgICAgdGltZXN0YW1wLm5hbm9zID1cbiAgICAgICAgICAgIHBhcnNlSW50KFwiMVwiICsgbWF0Y2hlc1s3XSArIFwiMFwiLnJlcGVhdCg5IC0gbWF0Y2hlc1s3XS5sZW5ndGgpKSAtXG4gICAgICAgICAgICAgICAgMTAwMDAwMDAwMDtcbiAgICB9XG59XG5mdW5jdGlvbiBkdXJhdGlvbkZyb21Kc29uKGR1cmF0aW9uLCBqc29uKSB7XG4gICAgaWYgKHR5cGVvZiBqc29uICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGRlY29kZSBtZXNzYWdlICR7ZHVyYXRpb24uJHR5cGVOYW1lfSBmcm9tIEpTT046ICR7Zm9ybWF0VmFsKGpzb24pfWApO1xuICAgIH1cbiAgICBjb25zdCBtYXRjaCA9IGpzb24ubWF0Y2goL14oLT9bMC05XSspKD86XFwuKFswLTldKykpP3MvKTtcbiAgICBpZiAobWF0Y2ggPT09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZGVjb2RlIG1lc3NhZ2UgJHtkdXJhdGlvbi4kdHlwZU5hbWV9IGZyb20gSlNPTjogJHtmb3JtYXRWYWwoanNvbil9YCk7XG4gICAgfVxuICAgIGNvbnN0IGxvbmdTZWNvbmRzID0gTnVtYmVyKG1hdGNoWzFdKTtcbiAgICBpZiAobG9uZ1NlY29uZHMgPiAzMTU1NzYwMDAwMDAgfHwgbG9uZ1NlY29uZHMgPCAtMzE1NTc2MDAwMDAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGRlY29kZSBtZXNzYWdlICR7ZHVyYXRpb24uJHR5cGVOYW1lfSBmcm9tIEpTT046ICR7Zm9ybWF0VmFsKGpzb24pfWApO1xuICAgIH1cbiAgICBkdXJhdGlvbi5zZWNvbmRzID0gcHJvdG9JbnQ2NC5wYXJzZShsb25nU2Vjb25kcyk7XG4gICAgaWYgKHR5cGVvZiBtYXRjaFsyXSAhPT0gXCJzdHJpbmdcIikge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IG5hbm9zU3RyID0gbWF0Y2hbMl0gKyBcIjBcIi5yZXBlYXQoOSAtIG1hdGNoWzJdLmxlbmd0aCk7XG4gICAgZHVyYXRpb24ubmFub3MgPSBwYXJzZUludChuYW5vc1N0cik7XG4gICAgaWYgKGxvbmdTZWNvbmRzIDwgMCB8fCBPYmplY3QuaXMobG9uZ1NlY29uZHMsIC0wKSkge1xuICAgICAgICBkdXJhdGlvbi5uYW5vcyA9IC1kdXJhdGlvbi5uYW5vcztcbiAgICB9XG59XG5mdW5jdGlvbiBmaWVsZE1hc2tGcm9tSnNvbihmaWVsZE1hc2ssIGpzb24pIHtcbiAgICBpZiAodHlwZW9mIGpzb24gIT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZGVjb2RlIG1lc3NhZ2UgJHtmaWVsZE1hc2suJHR5cGVOYW1lfSBmcm9tIEpTT046ICR7Zm9ybWF0VmFsKGpzb24pfWApO1xuICAgIH1cbiAgICBpZiAoanNvbiA9PT0gXCJcIikge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGZ1bmN0aW9uIGNhbWVsVG9TbmFrZShzdHIpIHtcbiAgICAgICAgaWYgKHN0ci5pbmNsdWRlcyhcIl9cIikpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGRlY29kZSBtZXNzYWdlICR7ZmllbGRNYXNrLiR0eXBlTmFtZX0gZnJvbSBKU09OOiBwYXRoIG5hbWVzIG11c3QgYmUgbG93ZXJDYW1lbENhc2VgKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzYyA9IHN0ci5yZXBsYWNlKC9bQS1aXS9nLCAobGV0dGVyKSA9PiBcIl9cIiArIGxldHRlci50b0xvd2VyQ2FzZSgpKTtcbiAgICAgICAgcmV0dXJuIHNjWzBdID09PSBcIl9cIiA/IHNjLnN1YnN0cmluZygxKSA6IHNjO1xuICAgIH1cbiAgICBmaWVsZE1hc2sucGF0aHMgPSBqc29uLnNwbGl0KFwiLFwiKS5tYXAoY2FtZWxUb1NuYWtlKTtcbn1cbmZ1bmN0aW9uIHN0cnVjdEZyb21Kc29uKHN0cnVjdCwganNvbikge1xuICAgIGlmICh0eXBlb2YganNvbiAhPSBcIm9iamVjdFwiIHx8IGpzb24gPT0gbnVsbCB8fCBBcnJheS5pc0FycmF5KGpzb24pKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGRlY29kZSBtZXNzYWdlICR7c3RydWN0LiR0eXBlTmFtZX0gZnJvbSBKU09OICR7Zm9ybWF0VmFsKGpzb24pfWApO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IFtrLCB2XSBvZiBPYmplY3QuZW50cmllcyhqc29uKSkge1xuICAgICAgICBjb25zdCBwYXJzZWRWID0gY3JlYXRlKFZhbHVlU2NoZW1hKTtcbiAgICAgICAgdmFsdWVGcm9tSnNvbihwYXJzZWRWLCB2KTtcbiAgICAgICAgc3RydWN0LmZpZWxkc1trXSA9IHBhcnNlZFY7XG4gICAgfVxufVxuZnVuY3Rpb24gdmFsdWVGcm9tSnNvbih2YWx1ZSwganNvbikge1xuICAgIHN3aXRjaCAodHlwZW9mIGpzb24pIHtcbiAgICAgICAgY2FzZSBcIm51bWJlclwiOlxuICAgICAgICAgICAgdmFsdWUua2luZCA9IHsgY2FzZTogXCJudW1iZXJWYWx1ZVwiLCB2YWx1ZToganNvbiB9O1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJzdHJpbmdcIjpcbiAgICAgICAgICAgIHZhbHVlLmtpbmQgPSB7IGNhc2U6IFwic3RyaW5nVmFsdWVcIiwgdmFsdWU6IGpzb24gfTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiYm9vbGVhblwiOlxuICAgICAgICAgICAgdmFsdWUua2luZCA9IHsgY2FzZTogXCJib29sVmFsdWVcIiwgdmFsdWU6IGpzb24gfTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwib2JqZWN0XCI6XG4gICAgICAgICAgICBpZiAoanNvbiA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHZhbHVlLmtpbmQgPSB7IGNhc2U6IFwibnVsbFZhbHVlXCIsIHZhbHVlOiBOdWxsVmFsdWUuTlVMTF9WQUxVRSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoQXJyYXkuaXNBcnJheShqc29uKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGxpc3RWYWx1ZSA9IGNyZWF0ZShMaXN0VmFsdWVTY2hlbWEpO1xuICAgICAgICAgICAgICAgIGxpc3RWYWx1ZUZyb21Kc29uKGxpc3RWYWx1ZSwganNvbik7XG4gICAgICAgICAgICAgICAgdmFsdWUua2luZCA9IHsgY2FzZTogXCJsaXN0VmFsdWVcIiwgdmFsdWU6IGxpc3RWYWx1ZSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3RydWN0ID0gY3JlYXRlKFN0cnVjdFNjaGVtYSk7XG4gICAgICAgICAgICAgICAgc3RydWN0RnJvbUpzb24oc3RydWN0LCBqc29uKTtcbiAgICAgICAgICAgICAgICB2YWx1ZS5raW5kID0geyBjYXNlOiBcInN0cnVjdFZhbHVlXCIsIHZhbHVlOiBzdHJ1Y3QgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZGVjb2RlIG1lc3NhZ2UgJHt2YWx1ZS4kdHlwZU5hbWV9IGZyb20gSlNPTiAke2Zvcm1hdFZhbChqc29uKX1gKTtcbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlO1xufVxuZnVuY3Rpb24gbGlzdFZhbHVlRnJvbUpzb24obGlzdFZhbHVlLCBqc29uKSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGpzb24pKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGRlY29kZSBtZXNzYWdlICR7bGlzdFZhbHVlLiR0eXBlTmFtZX0gZnJvbSBKU09OICR7Zm9ybWF0VmFsKGpzb24pfWApO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGUgb2YganNvbikge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGNyZWF0ZShWYWx1ZVNjaGVtYSk7XG4gICAgICAgIHZhbHVlRnJvbUpzb24odmFsdWUsIGUpO1xuICAgICAgICBsaXN0VmFsdWUudmFsdWVzLnB1c2godmFsdWUpO1xuICAgIH1cbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuaW1wb3J0IHsgcmVmbGVjdCB9IGZyb20gXCIuL3JlZmxlY3QvcmVmbGVjdC5qc1wiO1xuLyoqXG4gKiBNZXJnZSBtZXNzYWdlIGBzb3VyY2VgIGludG8gbWVzc2FnZSBgdGFyZ2V0YCwgZm9sbG93aW5nIFByb3RvYnVmIHNlbWFudGljcy5cbiAqXG4gKiBUaGlzIGlzIHRoZSBzYW1lIGFzIHNlcmlhbGl6aW5nIHRoZSBzb3VyY2UgbWVzc2FnZSwgdGhlbiBkZXNlcmlhbGl6aW5nIGl0XG4gKiBpbnRvIHRoZSB0YXJnZXQgbWVzc2FnZSB2aWEgYG1lcmdlRnJvbUJpbmFyeSgpYCwgd2l0aCBvbmUgZGlmZmVyZW5jZTpcbiAqIFdoaWxlIHNlcmlhbGl6YXRpb24gd2lsbCBjcmVhdGUgYSBjb3B5IG9mIGFsbCB2YWx1ZXMsIGBtZXJnZSgpYCB3aWxsIGNvcHlcbiAqIHRoZSByZWZlcmVuY2UgZm9yIGBieXRlc2AgYW5kIG1lc3NhZ2VzLlxuICpcbiAqIEFsc28gc2VlIGh0dHBzOi8vcHJvdG9idWYuY29tL2RvY3MvbGFuZ3VhZ2Utc3BlYyNtZXJnaW5nLXByb3RvYnVmLW1lc3NhZ2VzXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZShzY2hlbWEsIHRhcmdldCwgc291cmNlKSB7XG4gICAgcmVmbGVjdE1lcmdlKHJlZmxlY3Qoc2NoZW1hLCB0YXJnZXQpLCByZWZsZWN0KHNjaGVtYSwgc291cmNlKSk7XG59XG5mdW5jdGlvbiByZWZsZWN0TWVyZ2UodGFyZ2V0LCBzb3VyY2UpIHtcbiAgICB2YXIgX2E7XG4gICAgdmFyIF9iO1xuICAgIGNvbnN0IHNvdXJjZVVua25vd24gPSBzb3VyY2UubWVzc2FnZS4kdW5rbm93bjtcbiAgICBpZiAoc291cmNlVW5rbm93biAhPT0gdW5kZWZpbmVkICYmIHNvdXJjZVVua25vd24ubGVuZ3RoID4gMCkge1xuICAgICAgICAoX2EgPSAoX2IgPSB0YXJnZXQubWVzc2FnZSkuJHVua25vd24pICE9PSBudWxsICYmIF9hICE9PSB2b2lkIDAgPyBfYSA6IChfYi4kdW5rbm93biA9IFtdKTtcbiAgICAgICAgdGFyZ2V0Lm1lc3NhZ2UuJHVua25vd24ucHVzaCguLi5zb3VyY2VVbmtub3duKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBmIG9mIHRhcmdldC5maWVsZHMpIHtcbiAgICAgICAgaWYgKCFzb3VyY2UuaXNTZXQoZikpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHN3aXRjaCAoZi5maWVsZEtpbmQpIHtcbiAgICAgICAgICAgIGNhc2UgXCJzY2FsYXJcIjpcbiAgICAgICAgICAgIGNhc2UgXCJlbnVtXCI6XG4gICAgICAgICAgICAgICAgdGFyZ2V0LnNldChmLCBzb3VyY2UuZ2V0KGYpKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJtZXNzYWdlXCI6XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldC5pc1NldChmKSkge1xuICAgICAgICAgICAgICAgICAgICByZWZsZWN0TWVyZ2UodGFyZ2V0LmdldChmKSwgc291cmNlLmdldChmKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQuc2V0KGYsIHNvdXJjZS5nZXQoZikpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJsaXN0XCI6XG4gICAgICAgICAgICAgICAgY29uc3QgbGlzdCA9IHRhcmdldC5nZXQoZik7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBlIG9mIHNvdXJjZS5nZXQoZikpIHtcbiAgICAgICAgICAgICAgICAgICAgbGlzdC5hZGQoZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcIm1hcFwiOlxuICAgICAgICAgICAgICAgIGNvbnN0IG1hcCA9IHRhcmdldC5nZXQoZik7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBbaywgdl0gb2Ygc291cmNlLmdldChmKSkge1xuICAgICAgICAgICAgICAgICAgICBtYXAuc2V0KGssIHYpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuZXhwb3J0ICogZnJvbSBcIi4vdHlwZXMuanNcIjtcbmV4cG9ydCAqIGZyb20gXCIuL2lzLW1lc3NhZ2UuanNcIjtcbmV4cG9ydCAqIGZyb20gXCIuL2NyZWF0ZS5qc1wiO1xuZXhwb3J0ICogZnJvbSBcIi4vY2xvbmUuanNcIjtcbmV4cG9ydCAqIGZyb20gXCIuL2Rlc2NyaXB0b3JzLmpzXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9lcXVhbHMuanNcIjtcbmV4cG9ydCAqIGZyb20gXCIuL2ZpZWxkcy5qc1wiO1xuZXhwb3J0ICogZnJvbSBcIi4vcmVnaXN0cnkuanNcIjtcbmV4cG9ydCB7IHRvQmluYXJ5IH0gZnJvbSBcIi4vdG8tYmluYXJ5LmpzXCI7XG5leHBvcnQgeyBmcm9tQmluYXJ5LCBtZXJnZUZyb21CaW5hcnkgfSBmcm9tIFwiLi9mcm9tLWJpbmFyeS5qc1wiO1xuZXhwb3J0ICogZnJvbSBcIi4vdG8tanNvbi5qc1wiO1xuZXhwb3J0ICogZnJvbSBcIi4vZnJvbS1qc29uLmpzXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9tZXJnZS5qc1wiO1xuZXhwb3J0IHsgaGFzRXh0ZW5zaW9uLCBnZXRFeHRlbnNpb24sIHNldEV4dGVuc2lvbiwgY2xlYXJFeHRlbnNpb24sIGhhc09wdGlvbiwgZ2V0T3B0aW9uLCB9IGZyb20gXCIuL2V4dGVuc2lvbnMuanNcIjtcbmV4cG9ydCAqIGZyb20gXCIuL3Byb3RvLWludDY0LmpzXCI7XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbmltcG9ydCB7IHByb3RvQ2FtZWxDYXNlIH0gZnJvbSBcIi4uL3JlZmxlY3QvbmFtZXMuanNcIjtcbmltcG9ydCB7IGlzRmllbGRTZXQsIGNsZWFyRmllbGQgfSBmcm9tIFwiLi4vZmllbGRzLmpzXCI7XG5pbXBvcnQgeyBiYXNlNjRFbmNvZGUgfSBmcm9tIFwiLi4vd2lyZS9iYXNlNjQtZW5jb2RpbmcuanNcIjtcbmltcG9ydCB7IHRvQmluYXJ5IH0gZnJvbSBcIi4uL3RvLWJpbmFyeS5qc1wiO1xuaW1wb3J0IHsgY2xvbmUgfSBmcm9tIFwiLi4vY2xvbmUuanNcIjtcbmltcG9ydCB7IEVkaXRpb24sIEZpZWxkRGVzY3JpcHRvclByb3RvU2NoZW1hLCBGaWVsZE9wdGlvbnNTY2hlbWEsIEZpbGVEZXNjcmlwdG9yUHJvdG9TY2hlbWEsIERlc2NyaXB0b3JQcm90b1NjaGVtYSwgRW51bURlc2NyaXB0b3JQcm90b1NjaGVtYSwgfSBmcm9tIFwiLi4vd2t0L2dlbi9nb29nbGUvcHJvdG9idWYvZGVzY3JpcHRvcl9wYi5qc1wiO1xuLyoqXG4gKiBDcmVhdGUgbmVjZXNzYXJ5IGluZm9ybWF0aW9uIHRvIGVtYmVkIGEgZmlsZSBkZXNjcmlwdG9yIGluXG4gKiBnZW5lcmF0ZWQgY29kZS5cbiAqXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gZW1iZWRGaWxlRGVzYyhmaWxlKSB7XG4gICAgY29uc3QgZW1iZWQgPSB7XG4gICAgICAgIGJvb3RhYmxlOiBmYWxzZSxcbiAgICAgICAgcHJvdG8oKSB7XG4gICAgICAgICAgICBjb25zdCBzdHJpcHBlZCA9IGNsb25lKEZpbGVEZXNjcmlwdG9yUHJvdG9TY2hlbWEsIGZpbGUpO1xuICAgICAgICAgICAgY2xlYXJGaWVsZChzdHJpcHBlZCwgRmlsZURlc2NyaXB0b3JQcm90b1NjaGVtYS5maWVsZC5kZXBlbmRlbmN5KTtcbiAgICAgICAgICAgIGNsZWFyRmllbGQoc3RyaXBwZWQsIEZpbGVEZXNjcmlwdG9yUHJvdG9TY2hlbWEuZmllbGQuc291cmNlQ29kZUluZm8pO1xuICAgICAgICAgICAgc3RyaXBwZWQubWVzc2FnZVR5cGUubWFwKHN0cmlwSnNvbk5hbWVzKTtcbiAgICAgICAgICAgIHJldHVybiBzdHJpcHBlZDtcbiAgICAgICAgfSxcbiAgICAgICAgYmFzZTY0KCkge1xuICAgICAgICAgICAgY29uc3QgYnl0ZXMgPSB0b0JpbmFyeShGaWxlRGVzY3JpcHRvclByb3RvU2NoZW1hLCB0aGlzLnByb3RvKCkpO1xuICAgICAgICAgICAgcmV0dXJuIGJhc2U2NEVuY29kZShieXRlcywgXCJzdGRfcmF3XCIpO1xuICAgICAgICB9LFxuICAgIH07XG4gICAgcmV0dXJuIGZpbGUubmFtZSA9PSBcImdvb2dsZS9wcm90b2J1Zi9kZXNjcmlwdG9yLnByb3RvXCJcbiAgICAgICAgPyBPYmplY3QuYXNzaWduKE9iamVjdC5hc3NpZ24oe30sIGVtYmVkKSwgeyBib290YWJsZTogdHJ1ZSwgYm9vdCgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY3JlYXRlRmlsZURlc2NyaXB0b3JQcm90b0Jvb3QodGhpcy5wcm90bygpKTtcbiAgICAgICAgICAgIH0gfSkgOiBlbWJlZDtcbn1cbmZ1bmN0aW9uIHN0cmlwSnNvbk5hbWVzKGQpIHtcbiAgICBmb3IgKGNvbnN0IGYgb2YgZC5maWVsZCkge1xuICAgICAgICBpZiAoZi5qc29uTmFtZSA9PT0gcHJvdG9DYW1lbENhc2UoZi5uYW1lKSkge1xuICAgICAgICAgICAgY2xlYXJGaWVsZChmLCBGaWVsZERlc2NyaXB0b3JQcm90b1NjaGVtYS5maWVsZC5qc29uTmFtZSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yIChjb25zdCBuIG9mIGQubmVzdGVkVHlwZSkge1xuICAgICAgICBzdHJpcEpzb25OYW1lcyhuKTtcbiAgICB9XG59XG4vKipcbiAqIENvbXB1dGUgdGhlIHBhdGggdG8gYSBtZXNzYWdlLCBlbnVtZXJhdGlvbiwgZXh0ZW5zaW9uLCBvciBzZXJ2aWNlIGluIGFcbiAqIGZpbGUgZGVzY3JpcHRvci5cbiAqXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gcGF0aEluRmlsZURlc2MoZGVzYykge1xuICAgIGlmIChkZXNjLmtpbmQgPT0gXCJzZXJ2aWNlXCIpIHtcbiAgICAgICAgcmV0dXJuIFtkZXNjLmZpbGUuc2VydmljZXMuaW5kZXhPZihkZXNjKV07XG4gICAgfVxuICAgIGNvbnN0IHBhcmVudCA9IGRlc2MucGFyZW50O1xuICAgIGlmIChwYXJlbnQgPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHN3aXRjaCAoZGVzYy5raW5kKSB7XG4gICAgICAgICAgICBjYXNlIFwiZW51bVwiOlxuICAgICAgICAgICAgICAgIHJldHVybiBbZGVzYy5maWxlLmVudW1zLmluZGV4T2YoZGVzYyldO1xuICAgICAgICAgICAgY2FzZSBcIm1lc3NhZ2VcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gW2Rlc2MuZmlsZS5tZXNzYWdlcy5pbmRleE9mKGRlc2MpXTtcbiAgICAgICAgICAgIGNhc2UgXCJleHRlbnNpb25cIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gW2Rlc2MuZmlsZS5leHRlbnNpb25zLmluZGV4T2YoZGVzYyldO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZ1bmN0aW9uIGZpbmRQYXRoKGN1cikge1xuICAgICAgICBjb25zdCBuZXN0ZWQgPSBbXTtcbiAgICAgICAgZm9yIChsZXQgcGFyZW50ID0gY3VyLnBhcmVudDsgcGFyZW50Oykge1xuICAgICAgICAgICAgY29uc3QgaWR4ID0gcGFyZW50Lm5lc3RlZE1lc3NhZ2VzLmluZGV4T2YoY3VyKTtcbiAgICAgICAgICAgIG5lc3RlZC51bnNoaWZ0KGlkeCk7XG4gICAgICAgICAgICBjdXIgPSBwYXJlbnQ7XG4gICAgICAgICAgICBwYXJlbnQgPSBjdXIucGFyZW50O1xuICAgICAgICB9XG4gICAgICAgIG5lc3RlZC51bnNoaWZ0KGN1ci5maWxlLm1lc3NhZ2VzLmluZGV4T2YoY3VyKSk7XG4gICAgICAgIHJldHVybiBuZXN0ZWQ7XG4gICAgfVxuICAgIGNvbnN0IHBhdGggPSBmaW5kUGF0aChwYXJlbnQpO1xuICAgIHN3aXRjaCAoZGVzYy5raW5kKSB7XG4gICAgICAgIGNhc2UgXCJleHRlbnNpb25cIjpcbiAgICAgICAgICAgIHJldHVybiBbLi4ucGF0aCwgcGFyZW50Lm5lc3RlZEV4dGVuc2lvbnMuaW5kZXhPZihkZXNjKV07XG4gICAgICAgIGNhc2UgXCJtZXNzYWdlXCI6XG4gICAgICAgICAgICByZXR1cm4gWy4uLnBhdGgsIHBhcmVudC5uZXN0ZWRNZXNzYWdlcy5pbmRleE9mKGRlc2MpXTtcbiAgICAgICAgY2FzZSBcImVudW1cIjpcbiAgICAgICAgICAgIHJldHVybiBbLi4ucGF0aCwgcGFyZW50Lm5lc3RlZEVudW1zLmluZGV4T2YoZGVzYyldO1xuICAgIH1cbn1cbi8qKlxuICogVGhlIGZpbGUgZGVzY3JpcHRvciBmb3IgZ29vZ2xlL3Byb3RvYnVmL2Rlc2NyaXB0b3IucHJvdG8gY2Fubm90IGJlIGVtYmVkZGVkXG4gKiBpbiBzZXJpYWxpemVkIGZvcm0sIHNpbmNlIGl0IGlzIHJlcXVpcmVkIHRvIHBhcnNlIGl0c2VsZi5cbiAqXG4gKiBUaGlzIGZ1bmN0aW9uIHRha2VzIGFuIGluc3RhbmNlIG9mIHRoZSBtZXNzYWdlLCBhbmQgcmV0dXJucyBhIHBsYWluIG9iamVjdFxuICogdGhhdCBjYW4gYmUgaHlkcmF0ZWQgdG8gdGhlIG1lc3NhZ2UgYWdhaW4gdmlhIGJvb3RGaWxlRGVzY3JpcHRvclByb3RvKCkuXG4gKlxuICogVGhpcyBmdW5jdGlvbiBvbmx5IHdvcmtzIHdpdGggYSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5GaWxlRGVzY3JpcHRvclByb3RvXG4gKiBmb3IgZ29vZ2xlL3Byb3RvYnVmL2Rlc2NyaXB0b3IucHJvdG8sIGFuZCBvbmx5IHN1cHBvcnRzIGZlYXR1cmVzIHRoYXQgYXJlXG4gKiByZWxldmFudCBmb3IgdGhlIHNwZWNpZmljIHVzZSBjYXNlLiBGb3IgZXhhbXBsZSwgaXQgZGlzY2FyZHMgZmlsZSBvcHRpb25zLFxuICogcmVzZXJ2ZWQgcmFuZ2VzIGFuZCByZXNlcnZlZCBuYW1lcywgYW5kIGZpZWxkIG9wdGlvbnMgdGhhdCBhcmUgdW51c2VkIGluXG4gKiBkZXNjcmlwdG9yLnByb3RvLlxuICpcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVGaWxlRGVzY3JpcHRvclByb3RvQm9vdChwcm90bykge1xuICAgIHZhciBfYTtcbiAgICBhc3NlcnQocHJvdG8ubmFtZSA9PSBcImdvb2dsZS9wcm90b2J1Zi9kZXNjcmlwdG9yLnByb3RvXCIpO1xuICAgIGFzc2VydChwcm90by5wYWNrYWdlID09IFwiZ29vZ2xlLnByb3RvYnVmXCIpO1xuICAgIGFzc2VydCghcHJvdG8uZGVwZW5kZW5jeS5sZW5ndGgpO1xuICAgIGFzc2VydCghcHJvdG8ucHVibGljRGVwZW5kZW5jeS5sZW5ndGgpO1xuICAgIGFzc2VydCghcHJvdG8ud2Vha0RlcGVuZGVuY3kubGVuZ3RoKTtcbiAgICBhc3NlcnQoIXByb3RvLm9wdGlvbkRlcGVuZGVuY3kubGVuZ3RoKTtcbiAgICBhc3NlcnQoIXByb3RvLnNlcnZpY2UubGVuZ3RoKTtcbiAgICBhc3NlcnQoIXByb3RvLmV4dGVuc2lvbi5sZW5ndGgpO1xuICAgIGFzc2VydChwcm90by5zb3VyY2VDb2RlSW5mbyA9PT0gdW5kZWZpbmVkKTtcbiAgICBhc3NlcnQocHJvdG8uc3ludGF4ID09IFwiXCIgfHwgcHJvdG8uc3ludGF4ID09IFwicHJvdG8yXCIpO1xuICAgIGFzc2VydCghKChfYSA9IHByb3RvLm9wdGlvbnMpID09PSBudWxsIHx8IF9hID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfYS5mZWF0dXJlcykpOyAvLyB3ZSdyZSBkcm9wcGluZyBmaWxlIG9wdGlvbnNcbiAgICBhc3NlcnQocHJvdG8uZWRpdGlvbiA9PT0gRWRpdGlvbi5FRElUSU9OX1VOS05PV04pO1xuICAgIHJldHVybiB7XG4gICAgICAgIG5hbWU6IHByb3RvLm5hbWUsXG4gICAgICAgIHBhY2thZ2U6IHByb3RvLnBhY2thZ2UsXG4gICAgICAgIG1lc3NhZ2VUeXBlOiBwcm90by5tZXNzYWdlVHlwZS5tYXAoY3JlYXRlRGVzY3JpcHRvckJvb3QpLFxuICAgICAgICBlbnVtVHlwZTogcHJvdG8uZW51bVR5cGUubWFwKGNyZWF0ZUVudW1EZXNjcmlwdG9yQm9vdCksXG4gICAgfTtcbn1cbmZ1bmN0aW9uIGNyZWF0ZURlc2NyaXB0b3JCb290KHByb3RvKSB7XG4gICAgYXNzZXJ0KHByb3RvLmV4dGVuc2lvbi5sZW5ndGggPT0gMCk7XG4gICAgYXNzZXJ0KCFwcm90by5vbmVvZkRlY2wubGVuZ3RoKTtcbiAgICBhc3NlcnQoIXByb3RvLm9wdGlvbnMpO1xuICAgIGFzc2VydCghaXNGaWVsZFNldChwcm90bywgRGVzY3JpcHRvclByb3RvU2NoZW1hLmZpZWxkLnZpc2liaWxpdHkpKTtcbiAgICBjb25zdCBiID0ge1xuICAgICAgICBuYW1lOiBwcm90by5uYW1lLFxuICAgIH07XG4gICAgaWYgKHByb3RvLmZpZWxkLmxlbmd0aCkge1xuICAgICAgICBiLmZpZWxkID0gcHJvdG8uZmllbGQubWFwKGNyZWF0ZUZpZWxkRGVzY3JpcHRvckJvb3QpO1xuICAgIH1cbiAgICBpZiAocHJvdG8ubmVzdGVkVHlwZS5sZW5ndGgpIHtcbiAgICAgICAgYi5uZXN0ZWRUeXBlID0gcHJvdG8ubmVzdGVkVHlwZS5tYXAoY3JlYXRlRGVzY3JpcHRvckJvb3QpO1xuICAgIH1cbiAgICBpZiAocHJvdG8uZW51bVR5cGUubGVuZ3RoKSB7XG4gICAgICAgIGIuZW51bVR5cGUgPSBwcm90by5lbnVtVHlwZS5tYXAoY3JlYXRlRW51bURlc2NyaXB0b3JCb290KTtcbiAgICB9XG4gICAgaWYgKHByb3RvLmV4dGVuc2lvblJhbmdlLmxlbmd0aCkge1xuICAgICAgICBiLmV4dGVuc2lvblJhbmdlID0gcHJvdG8uZXh0ZW5zaW9uUmFuZ2UubWFwKChyKSA9PiB7XG4gICAgICAgICAgICBhc3NlcnQoIXIub3B0aW9ucyk7XG4gICAgICAgICAgICByZXR1cm4geyBzdGFydDogci5zdGFydCwgZW5kOiByLmVuZCB9O1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIGI7XG59XG5mdW5jdGlvbiBjcmVhdGVGaWVsZERlc2NyaXB0b3JCb290KHByb3RvKSB7XG4gICAgYXNzZXJ0KGlzRmllbGRTZXQocHJvdG8sIEZpZWxkRGVzY3JpcHRvclByb3RvU2NoZW1hLmZpZWxkLm5hbWUpKTtcbiAgICBhc3NlcnQoaXNGaWVsZFNldChwcm90bywgRmllbGREZXNjcmlwdG9yUHJvdG9TY2hlbWEuZmllbGQubnVtYmVyKSk7XG4gICAgYXNzZXJ0KGlzRmllbGRTZXQocHJvdG8sIEZpZWxkRGVzY3JpcHRvclByb3RvU2NoZW1hLmZpZWxkLnR5cGUpKTtcbiAgICBhc3NlcnQoIWlzRmllbGRTZXQocHJvdG8sIEZpZWxkRGVzY3JpcHRvclByb3RvU2NoZW1hLmZpZWxkLm9uZW9mSW5kZXgpKTtcbiAgICBhc3NlcnQoIWlzRmllbGRTZXQocHJvdG8sIEZpZWxkRGVzY3JpcHRvclByb3RvU2NoZW1hLmZpZWxkLmpzb25OYW1lKSB8fFxuICAgICAgICBwcm90by5qc29uTmFtZSA9PT0gcHJvdG9DYW1lbENhc2UocHJvdG8ubmFtZSkpO1xuICAgIGNvbnN0IGIgPSB7XG4gICAgICAgIG5hbWU6IHByb3RvLm5hbWUsXG4gICAgICAgIG51bWJlcjogcHJvdG8ubnVtYmVyLFxuICAgICAgICB0eXBlOiBwcm90by50eXBlLFxuICAgIH07XG4gICAgaWYgKGlzRmllbGRTZXQocHJvdG8sIEZpZWxkRGVzY3JpcHRvclByb3RvU2NoZW1hLmZpZWxkLmxhYmVsKSkge1xuICAgICAgICBiLmxhYmVsID0gcHJvdG8ubGFiZWw7XG4gICAgfVxuICAgIGlmIChpc0ZpZWxkU2V0KHByb3RvLCBGaWVsZERlc2NyaXB0b3JQcm90b1NjaGVtYS5maWVsZC50eXBlTmFtZSkpIHtcbiAgICAgICAgYi50eXBlTmFtZSA9IHByb3RvLnR5cGVOYW1lO1xuICAgIH1cbiAgICBpZiAoaXNGaWVsZFNldChwcm90bywgRmllbGREZXNjcmlwdG9yUHJvdG9TY2hlbWEuZmllbGQuZXh0ZW5kZWUpKSB7XG4gICAgICAgIGIuZXh0ZW5kZWUgPSBwcm90by5leHRlbmRlZTtcbiAgICB9XG4gICAgaWYgKGlzRmllbGRTZXQocHJvdG8sIEZpZWxkRGVzY3JpcHRvclByb3RvU2NoZW1hLmZpZWxkLmRlZmF1bHRWYWx1ZSkpIHtcbiAgICAgICAgYi5kZWZhdWx0VmFsdWUgPSBwcm90by5kZWZhdWx0VmFsdWU7XG4gICAgfVxuICAgIGlmIChwcm90by5vcHRpb25zKSB7XG4gICAgICAgIGIub3B0aW9ucyA9IGNyZWF0ZUZpZWxkT3B0aW9uc0Jvb3QocHJvdG8ub3B0aW9ucyk7XG4gICAgfVxuICAgIHJldHVybiBiO1xufVxuZnVuY3Rpb24gY3JlYXRlRmllbGRPcHRpb25zQm9vdChwcm90bykge1xuICAgIGNvbnN0IGIgPSB7fTtcbiAgICBhc3NlcnQoIWlzRmllbGRTZXQocHJvdG8sIEZpZWxkT3B0aW9uc1NjaGVtYS5maWVsZC5jdHlwZSkpO1xuICAgIGlmIChpc0ZpZWxkU2V0KHByb3RvLCBGaWVsZE9wdGlvbnNTY2hlbWEuZmllbGQucGFja2VkKSkge1xuICAgICAgICBiLnBhY2tlZCA9IHByb3RvLnBhY2tlZDtcbiAgICB9XG4gICAgYXNzZXJ0KCFpc0ZpZWxkU2V0KHByb3RvLCBGaWVsZE9wdGlvbnNTY2hlbWEuZmllbGQuanN0eXBlKSk7XG4gICAgYXNzZXJ0KCFpc0ZpZWxkU2V0KHByb3RvLCBGaWVsZE9wdGlvbnNTY2hlbWEuZmllbGQubGF6eSkpO1xuICAgIGFzc2VydCghaXNGaWVsZFNldChwcm90bywgRmllbGRPcHRpb25zU2NoZW1hLmZpZWxkLnVudmVyaWZpZWRMYXp5KSk7XG4gICAgaWYgKGlzRmllbGRTZXQocHJvdG8sIEZpZWxkT3B0aW9uc1NjaGVtYS5maWVsZC5kZXByZWNhdGVkKSkge1xuICAgICAgICBiLmRlcHJlY2F0ZWQgPSBwcm90by5kZXByZWNhdGVkO1xuICAgIH1cbiAgICBhc3NlcnQoIWlzRmllbGRTZXQocHJvdG8sIEZpZWxkT3B0aW9uc1NjaGVtYS5maWVsZC53ZWFrKSk7XG4gICAgYXNzZXJ0KCFpc0ZpZWxkU2V0KHByb3RvLCBGaWVsZE9wdGlvbnNTY2hlbWEuZmllbGQuZGVidWdSZWRhY3QpKTtcbiAgICBpZiAoaXNGaWVsZFNldChwcm90bywgRmllbGRPcHRpb25zU2NoZW1hLmZpZWxkLnJldGVudGlvbikpIHtcbiAgICAgICAgYi5yZXRlbnRpb24gPSBwcm90by5yZXRlbnRpb247XG4gICAgfVxuICAgIGlmIChwcm90by50YXJnZXRzLmxlbmd0aCkge1xuICAgICAgICBiLnRhcmdldHMgPSBwcm90by50YXJnZXRzO1xuICAgIH1cbiAgICBpZiAocHJvdG8uZWRpdGlvbkRlZmF1bHRzLmxlbmd0aCkge1xuICAgICAgICBiLmVkaXRpb25EZWZhdWx0cyA9IHByb3RvLmVkaXRpb25EZWZhdWx0cy5tYXAoKGQpID0+ICh7XG4gICAgICAgICAgICB2YWx1ZTogZC52YWx1ZSxcbiAgICAgICAgICAgIGVkaXRpb246IGQuZWRpdGlvbixcbiAgICAgICAgfSkpO1xuICAgIH1cbiAgICBhc3NlcnQoIWlzRmllbGRTZXQocHJvdG8sIEZpZWxkT3B0aW9uc1NjaGVtYS5maWVsZC5mZWF0dXJlcykpO1xuICAgIGFzc2VydCghaXNGaWVsZFNldChwcm90bywgRmllbGRPcHRpb25zU2NoZW1hLmZpZWxkLnVuaW50ZXJwcmV0ZWRPcHRpb24pKTtcbiAgICByZXR1cm4gYjtcbn1cbmZ1bmN0aW9uIGNyZWF0ZUVudW1EZXNjcmlwdG9yQm9vdChwcm90bykge1xuICAgIGFzc2VydCghcHJvdG8ub3B0aW9ucyk7XG4gICAgYXNzZXJ0KCFpc0ZpZWxkU2V0KHByb3RvLCBFbnVtRGVzY3JpcHRvclByb3RvU2NoZW1hLmZpZWxkLnZpc2liaWxpdHkpKTtcbiAgICByZXR1cm4ge1xuICAgICAgICBuYW1lOiBwcm90by5uYW1lLFxuICAgICAgICB2YWx1ZTogcHJvdG8udmFsdWUubWFwKCh2KSA9PiB7XG4gICAgICAgICAgICBhc3NlcnQoIXYub3B0aW9ucyk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIG5hbWU6IHYubmFtZSxcbiAgICAgICAgICAgICAgICBudW1iZXI6IHYubnVtYmVyLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSksXG4gICAgfTtcbn1cbi8qKlxuICogQXNzZXJ0IHRoYXQgY29uZGl0aW9uIGlzIHRydXRoeSBvciB0aHJvdyBlcnJvci5cbiAqL1xuZnVuY3Rpb24gYXNzZXJ0KGNvbmRpdGlvbikge1xuICAgIGlmICghY29uZGl0aW9uKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcigpO1xuICAgIH1cbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuLyoqXG4gKiBIeWRyYXRlIGEgc2VydmljZSBkZXNjcmlwdG9yLlxuICpcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXJ2aWNlRGVzYyhmaWxlLCBwYXRoLCAuLi5wYXRocykge1xuICAgIGlmIChwYXRocy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcigpO1xuICAgIH1cbiAgICByZXR1cm4gZmlsZS5zZXJ2aWNlc1twYXRoXTtcbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuLyoqXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnQgY29uc3QgcGFja2FnZU5hbWUgPSBcIkBidWZidWlsZC9wcm90b2J1ZlwiO1xuLyoqXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnQgY29uc3Qgd2t0UHVibGljSW1wb3J0UGF0aHMgPSB7XG4gICAgXCJnb29nbGUvcHJvdG9idWYvY29tcGlsZXIvcGx1Z2luLnByb3RvXCI6IHBhY2thZ2VOYW1lICsgXCIvd2t0XCIsXG4gICAgXCJnb29nbGUvcHJvdG9idWYvYW55LnByb3RvXCI6IHBhY2thZ2VOYW1lICsgXCIvd2t0XCIsXG4gICAgXCJnb29nbGUvcHJvdG9idWYvYXBpLnByb3RvXCI6IHBhY2thZ2VOYW1lICsgXCIvd2t0XCIsXG4gICAgXCJnb29nbGUvcHJvdG9idWYvY3BwX2ZlYXR1cmVzLnByb3RvXCI6IHBhY2thZ2VOYW1lICsgXCIvd2t0XCIsXG4gICAgXCJnb29nbGUvcHJvdG9idWYvZGVzY3JpcHRvci5wcm90b1wiOiBwYWNrYWdlTmFtZSArIFwiL3drdFwiLFxuICAgIFwiZ29vZ2xlL3Byb3RvYnVmL2R1cmF0aW9uLnByb3RvXCI6IHBhY2thZ2VOYW1lICsgXCIvd2t0XCIsXG4gICAgXCJnb29nbGUvcHJvdG9idWYvZW1wdHkucHJvdG9cIjogcGFja2FnZU5hbWUgKyBcIi93a3RcIixcbiAgICBcImdvb2dsZS9wcm90b2J1Zi9maWVsZF9tYXNrLnByb3RvXCI6IHBhY2thZ2VOYW1lICsgXCIvd2t0XCIsXG4gICAgXCJnb29nbGUvcHJvdG9idWYvZ29fZmVhdHVyZXMucHJvdG9cIjogcGFja2FnZU5hbWUgKyBcIi93a3RcIixcbiAgICBcImdvb2dsZS9wcm90b2J1Zi9qYXZhX2ZlYXR1cmVzLnByb3RvXCI6IHBhY2thZ2VOYW1lICsgXCIvd2t0XCIsXG4gICAgXCJnb29nbGUvcHJvdG9idWYvc291cmNlX2NvbnRleHQucHJvdG9cIjogcGFja2FnZU5hbWUgKyBcIi93a3RcIixcbiAgICBcImdvb2dsZS9wcm90b2J1Zi9zdHJ1Y3QucHJvdG9cIjogcGFja2FnZU5hbWUgKyBcIi93a3RcIixcbiAgICBcImdvb2dsZS9wcm90b2J1Zi90aW1lc3RhbXAucHJvdG9cIjogcGFja2FnZU5hbWUgKyBcIi93a3RcIixcbiAgICBcImdvb2dsZS9wcm90b2J1Zi90eXBlLnByb3RvXCI6IHBhY2thZ2VOYW1lICsgXCIvd2t0XCIsXG4gICAgXCJnb29nbGUvcHJvdG9idWYvd3JhcHBlcnMucHJvdG9cIjogcGFja2FnZU5hbWUgKyBcIi93a3RcIixcbn07XG4vKipcbiAqIEBwcml2YXRlXG4gKi9cbi8vIGJpb21lLWlnbm9yZSBmb3JtYXQ6IHdhbnQgdGhpcyB0byByZWFkIHdlbGxcbmV4cG9ydCBjb25zdCBzeW1ib2xzID0ge1xuICAgIGlzTWVzc2FnZTogeyB0eXBlT25seTogZmFsc2UsIGJvb3RzdHJhcFdrdEZyb206IFwiLi4vLi4vaXMtbWVzc2FnZS5qc1wiLCBmcm9tOiBwYWNrYWdlTmFtZSB9LFxuICAgIE1lc3NhZ2U6IHsgdHlwZU9ubHk6IHRydWUsIGJvb3RzdHJhcFdrdEZyb206IFwiLi4vLi4vdHlwZXMuanNcIiwgZnJvbTogcGFja2FnZU5hbWUgfSxcbiAgICBjcmVhdGU6IHsgdHlwZU9ubHk6IGZhbHNlLCBib290c3RyYXBXa3RGcm9tOiBcIi4uLy4uL2NyZWF0ZS5qc1wiLCBmcm9tOiBwYWNrYWdlTmFtZSB9LFxuICAgIGZyb21Kc29uOiB7IHR5cGVPbmx5OiBmYWxzZSwgYm9vdHN0cmFwV2t0RnJvbTogXCIuLi8uLi9mcm9tLWpzb24uanNcIiwgZnJvbTogcGFja2FnZU5hbWUgfSxcbiAgICBmcm9tSnNvblN0cmluZzogeyB0eXBlT25seTogZmFsc2UsIGJvb3RzdHJhcFdrdEZyb206IFwiLi4vLi4vZnJvbS1qc29uLmpzXCIsIGZyb206IHBhY2thZ2VOYW1lIH0sXG4gICAgZnJvbUJpbmFyeTogeyB0eXBlT25seTogZmFsc2UsIGJvb3RzdHJhcFdrdEZyb206IFwiLi4vLi4vZnJvbS1iaW5hcnkuanNcIiwgZnJvbTogcGFja2FnZU5hbWUgfSxcbiAgICB0b0JpbmFyeTogeyB0eXBlT25seTogZmFsc2UsIGJvb3RzdHJhcFdrdEZyb206IFwiLi4vLi4vdG8tYmluYXJ5LmpzXCIsIGZyb206IHBhY2thZ2VOYW1lIH0sXG4gICAgdG9Kc29uOiB7IHR5cGVPbmx5OiBmYWxzZSwgYm9vdHN0cmFwV2t0RnJvbTogXCIuLi8uLi90by1qc29uLmpzXCIsIGZyb206IHBhY2thZ2VOYW1lIH0sXG4gICAgdG9Kc29uU3RyaW5nOiB7IHR5cGVPbmx5OiBmYWxzZSwgYm9vdHN0cmFwV2t0RnJvbTogXCIuLi8uLi90by1qc29uLmpzXCIsIGZyb206IHBhY2thZ2VOYW1lIH0sXG4gICAgcHJvdG9JbnQ2NDogeyB0eXBlT25seTogZmFsc2UsIGJvb3RzdHJhcFdrdEZyb206IFwiLi4vLi4vcHJvdG8taW50NjQuanNcIiwgZnJvbTogcGFja2FnZU5hbWUgfSxcbiAgICBKc29uVmFsdWU6IHsgdHlwZU9ubHk6IHRydWUsIGJvb3RzdHJhcFdrdEZyb206IFwiLi4vLi4vanNvbi12YWx1ZS5qc1wiLCBmcm9tOiBwYWNrYWdlTmFtZSB9LFxuICAgIEpzb25PYmplY3Q6IHsgdHlwZU9ubHk6IHRydWUsIGJvb3RzdHJhcFdrdEZyb206IFwiLi4vLi4vanNvbi12YWx1ZS5qc1wiLCBmcm9tOiBwYWNrYWdlTmFtZSB9LFxuICAgIGNvZGVnZW46IHtcbiAgICAgICAgYm9vdDogeyB0eXBlT25seTogZmFsc2UsIGJvb3RzdHJhcFdrdEZyb206IFwiLi4vLi4vY29kZWdlbnYyL2Jvb3QuanNcIiwgZnJvbTogcGFja2FnZU5hbWUgKyBcIi9jb2RlZ2VudjJcIiB9LFxuICAgICAgICBmaWxlRGVzYzogeyB0eXBlT25seTogZmFsc2UsIGJvb3RzdHJhcFdrdEZyb206IFwiLi4vLi4vY29kZWdlbnYyL2ZpbGUuanNcIiwgZnJvbTogcGFja2FnZU5hbWUgKyBcIi9jb2RlZ2VudjJcIiB9LFxuICAgICAgICBlbnVtRGVzYzogeyB0eXBlT25seTogZmFsc2UsIGJvb3RzdHJhcFdrdEZyb206IFwiLi4vLi4vY29kZWdlbnYyL2VudW0uanNcIiwgZnJvbTogcGFja2FnZU5hbWUgKyBcIi9jb2RlZ2VudjJcIiB9LFxuICAgICAgICBleHREZXNjOiB7IHR5cGVPbmx5OiBmYWxzZSwgYm9vdHN0cmFwV2t0RnJvbTogXCIuLi8uLi9jb2RlZ2VudjIvZXh0ZW5zaW9uLmpzXCIsIGZyb206IHBhY2thZ2VOYW1lICsgXCIvY29kZWdlbnYyXCIgfSxcbiAgICAgICAgbWVzc2FnZURlc2M6IHsgdHlwZU9ubHk6IGZhbHNlLCBib290c3RyYXBXa3RGcm9tOiBcIi4uLy4uL2NvZGVnZW52Mi9tZXNzYWdlLmpzXCIsIGZyb206IHBhY2thZ2VOYW1lICsgXCIvY29kZWdlbnYyXCIgfSxcbiAgICAgICAgc2VydmljZURlc2M6IHsgdHlwZU9ubHk6IGZhbHNlLCBib290c3RyYXBXa3RGcm9tOiBcIi4uLy4uL2NvZGVnZW52Mi9zZXJ2aWNlLmpzXCIsIGZyb206IHBhY2thZ2VOYW1lICsgXCIvY29kZWdlbnYyXCIgfSxcbiAgICAgICAgdHNFbnVtOiB7IHR5cGVPbmx5OiBmYWxzZSwgYm9vdHN0cmFwV2t0RnJvbTogXCIuLi8uLi9jb2RlZ2VudjIvZW51bS5qc1wiLCBmcm9tOiBwYWNrYWdlTmFtZSArIFwiL2NvZGVnZW52MlwiIH0sXG4gICAgICAgIEdlbkZpbGU6IHsgdHlwZU9ubHk6IHRydWUsIGJvb3RzdHJhcFdrdEZyb206IFwiLi4vLi4vY29kZWdlbnYyL3R5cGVzLmpzXCIsIGZyb206IHBhY2thZ2VOYW1lICsgXCIvY29kZWdlbnYyXCIgfSxcbiAgICAgICAgR2VuRW51bTogeyB0eXBlT25seTogdHJ1ZSwgYm9vdHN0cmFwV2t0RnJvbTogXCIuLi8uLi9jb2RlZ2VudjIvdHlwZXMuanNcIiwgZnJvbTogcGFja2FnZU5hbWUgKyBcIi9jb2RlZ2VudjJcIiB9LFxuICAgICAgICBHZW5FeHRlbnNpb246IHsgdHlwZU9ubHk6IHRydWUsIGJvb3RzdHJhcFdrdEZyb206IFwiLi4vLi4vY29kZWdlbnYyL3R5cGVzLmpzXCIsIGZyb206IHBhY2thZ2VOYW1lICsgXCIvY29kZWdlbnYyXCIgfSxcbiAgICAgICAgR2VuTWVzc2FnZTogeyB0eXBlT25seTogdHJ1ZSwgYm9vdHN0cmFwV2t0RnJvbTogXCIuLi8uLi9jb2RlZ2VudjIvdHlwZXMuanNcIiwgZnJvbTogcGFja2FnZU5hbWUgKyBcIi9jb2RlZ2VudjJcIiB9LFxuICAgICAgICBHZW5TZXJ2aWNlOiB7IHR5cGVPbmx5OiB0cnVlLCBib290c3RyYXBXa3RGcm9tOiBcIi4uLy4uL2NvZGVnZW52Mi90eXBlcy5qc1wiLCBmcm9tOiBwYWNrYWdlTmFtZSArIFwiL2NvZGVnZW52MlwiIH0sXG4gICAgfSxcbn07XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbmltcG9ydCB7IFNjYWxhclR5cGUgfSBmcm9tIFwiLi4vZGVzY3JpcHRvcnMuanNcIjtcbi8qKlxuICogUmV0dXJuIHRoZSBUeXBlU2NyaXB0IHR5cGUgKGFzIGEgc3RyaW5nKSBmb3IgdGhlIGdpdmVuIHNjYWxhciB0eXBlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2NhbGFyVHlwZVNjcmlwdFR5cGUoc2NhbGFyLCBsb25nQXNTdHJpbmcpIHtcbiAgICBzd2l0Y2ggKHNjYWxhcikge1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU1RSSU5HOlxuICAgICAgICAgICAgcmV0dXJuIFwic3RyaW5nXCI7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5CT09MOlxuICAgICAgICAgICAgcmV0dXJuIFwiYm9vbGVhblwiO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuVUlOVDY0OlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0ZJWEVENjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5GSVhFRDY0OlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0lOVDY0OlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuSU5UNjQ6XG4gICAgICAgICAgICByZXR1cm4gbG9uZ0FzU3RyaW5nID8gXCJzdHJpbmdcIiA6IFwiYmlnaW50XCI7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5CWVRFUzpcbiAgICAgICAgICAgIHJldHVybiBcIlVpbnQ4QXJyYXlcIjtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiBcIm51bWJlclwiO1xuICAgIH1cbn1cbi8qKlxuICogUmV0dXJuIHRoZSBKU09OIHR5cGUgKGFzIGEgc3RyaW5nKSBmb3IgdGhlIGdpdmVuIHNjYWxhciB0eXBlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2NhbGFySnNvblR5cGUoc2NhbGFyKSB7XG4gICAgc3dpdGNoIChzY2FsYXIpIHtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkRPVUJMRTpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZMT0FUOlxuICAgICAgICAgICAgcmV0dXJuIGBudW1iZXIgfCBcIk5hTlwiIHwgXCJJbmZpbml0eVwiIHwgXCItSW5maW5pdHlcImA7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5VSU5UNjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TRklYRUQ2NDpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZJWEVENjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TSU5UNjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5JTlQ2NDpcbiAgICAgICAgICAgIHJldHVybiBcInN0cmluZ1wiO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuSU5UMzI6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5GSVhFRDMyOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuVUlOVDMyOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0ZJWEVEMzI6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TSU5UMzI6XG4gICAgICAgICAgICByZXR1cm4gXCJudW1iZXJcIjtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNUUklORzpcbiAgICAgICAgICAgIHJldHVybiBcInN0cmluZ1wiO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuQk9PTDpcbiAgICAgICAgICAgIHJldHVybiBcImJvb2xlYW5cIjtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkJZVEVTOlxuICAgICAgICAgICAgcmV0dXJuIFwic3RyaW5nXCI7XG4gICAgfVxufVxuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5jbGFzcyBicmFuZHYyIHtcbiAgICBjb25zdHJ1Y3RvcigpIHtcbiAgICAgICAgdGhpcy52ID0gXCJjb2RlZ2VudjJcIjtcbiAgICAgICAgdGhpcy5hID0gZmFsc2U7XG4gICAgICAgIHRoaXMuYiA9IGZhbHNlO1xuICAgIH1cbn1cbmV4cG9ydCB7fTtcbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuZXhwb3J0ICogZnJvbSBcIi4vYm9vdC5qc1wiO1xuZXhwb3J0ICogZnJvbSBcIi4vZW1iZWQuanNcIjtcbmV4cG9ydCAqIGZyb20gXCIuL2VudW0uanNcIjtcbmV4cG9ydCAqIGZyb20gXCIuL2V4dGVuc2lvbi5qc1wiO1xuZXhwb3J0ICogZnJvbSBcIi4vZmlsZS5qc1wiO1xuZXhwb3J0ICogZnJvbSBcIi4vbWVzc2FnZS5qc1wiO1xuZXhwb3J0ICogZnJvbSBcIi4vc2VydmljZS5qc1wiO1xuZXhwb3J0ICogZnJvbSBcIi4vc3ltYm9scy5qc1wiO1xuZXhwb3J0ICogZnJvbSBcIi4vc2NhbGFyLmpzXCI7XG5leHBvcnQgKiBmcm9tIFwiLi90eXBlcy5qc1wiO1xuIiwgIi8vIEBnZW5lcmF0ZWQgYnkgcHJvdG9jLWdlbi1lcyB2Mi45LjAgd2l0aCBwYXJhbWV0ZXIgXCJ0YXJnZXQ9dHNcIlxuLy8gQGdlbmVyYXRlZCBmcm9tIGZpbGUgcHJvdG8vd3NfbWVzc2FnZXMucHJvdG8gKHBhY2thZ2UgbGlnaHRzcGVlZGR1ZWwud3MsIHN5bnRheCBwcm90bzMpXG4vKiBlc2xpbnQtZGlzYWJsZSAqL1xuXG5pbXBvcnQgdHlwZSB7IEdlbkVudW0sIEdlbkZpbGUsIEdlbk1lc3NhZ2UgfSBmcm9tIFwiQGJ1ZmJ1aWxkL3Byb3RvYnVmL2NvZGVnZW52MlwiO1xuaW1wb3J0IHsgZW51bURlc2MsIGZpbGVEZXNjLCBtZXNzYWdlRGVzYyB9IGZyb20gXCJAYnVmYnVpbGQvcHJvdG9idWYvY29kZWdlbnYyXCI7XG5pbXBvcnQgdHlwZSB7IE1lc3NhZ2UgfSBmcm9tIFwiQGJ1ZmJ1aWxkL3Byb3RvYnVmXCI7XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBmaWxlIHByb3RvL3dzX21lc3NhZ2VzLnByb3RvLlxuICovXG5leHBvcnQgY29uc3QgZmlsZV9wcm90b193c19tZXNzYWdlczogR2VuRmlsZSA9IC8qQF9fUFVSRV9fKi9cbiAgZmlsZURlc2MoXCJDaGR3Y205MGJ5OTNjMTl0WlhOellXZGxjeTV3Y205MGJ4SVJiR2xuYUhSemNHVmxaR1IxWld3dWQzTWl3QTBLQ2xkelJXNTJaV3h2Y0dVU05nb01jM1JoZEdWZmRYQmtZWFJsR0FFZ0FTZ0xNaDR1YkdsbmFIUnpjR1ZsWkdSMVpXd3VkM011VTNSaGRHVlZjR1JoZEdWSUFCSTFDZ2x5YjI5dFgyWjFiR3dZQWlBQktBc3lJQzVzYVdkb2RITndaV1ZrWkhWbGJDNTNjeTVTYjI5dFJuVnNiRVZ5Y205eVNBQVNMUW9FYW05cGJoZ0tJQUVvQ3pJZExteHBaMmgwYzNCbFpXUmtkV1ZzTG5kekxrTnNhV1Z1ZEVwdmFXNUlBQkl3Q2dsemNHRjNibDlpYjNRWUN5QUJLQXN5R3k1c2FXZG9kSE53WldWa1pIVmxiQzUzY3k1VGNHRjNia0p2ZEVnQUVqWUtER0ZrWkY5M1lYbHdiMmx1ZEJnTUlBRW9DekllTG14cFoyaDBjM0JsWldSa2RXVnNMbmR6TGtGa1pGZGhlWEJ2YVc1MFNBQVNQQW9QZFhCa1lYUmxYM2RoZVhCdmFXNTBHQTBnQVNnTE1pRXViR2xuYUhSemNHVmxaR1IxWld3dWQzTXVWWEJrWVhSbFYyRjVjRzlwYm5SSUFCSTRDZzF0YjNabFgzZGhlWEJ2YVc1MEdBNGdBU2dMTWg4dWJHbG5hSFJ6Y0dWbFpHUjFaV3d1ZDNNdVRXOTJaVmRoZVhCdmFXNTBTQUFTUEFvUFpHVnNaWFJsWDNkaGVYQnZhVzUwR0E4Z0FTZ0xNaUV1YkdsbmFIUnpjR1ZsWkdSMVpXd3VkM011UkdWc1pYUmxWMkY1Y0c5cGJuUklBQkk4Q2c5amJHVmhjbDkzWVhsd2IybHVkSE1ZRUNBQktBc3lJUzVzYVdkb2RITndaV1ZrWkhWbGJDNTNjeTVEYkdWaGNsZGhlWEJ2YVc1MGMwZ0FFa0FLRVdOdmJtWnBaM1Z5WlY5dGFYTnphV3hsR0JFZ0FTZ0xNaU11YkdsbmFIUnpjR1ZsWkdSMVpXd3VkM011UTI5dVptbG5kWEpsVFdsemMybHNaVWdBRWtVS0ZHRmtaRjl0YVhOemFXeGxYM2RoZVhCdmFXNTBHQklnQVNnTE1pVXViR2xuYUhSemNHVmxaR1IxWld3dWQzTXVRV1JrVFdsemMybHNaVmRoZVhCdmFXNTBTQUFTVmdvZGRYQmtZWFJsWDIxcGMzTnBiR1ZmZDJGNWNHOXBiblJmYzNCbFpXUVlFeUFCS0FzeUxTNXNhV2RvZEhOd1pXVmtaSFZsYkM1M2N5NVZjR1JoZEdWTmFYTnphV3hsVjJGNWNHOXBiblJUY0dWbFpFZ0FFa2NLRlcxdmRtVmZiV2x6YzJsc1pWOTNZWGx3YjJsdWRCZ1VJQUVvQ3pJbUxteHBaMmgwYzNCbFpXUmtkV1ZzTG5kekxrMXZkbVZOYVhOemFXeGxWMkY1Y0c5cGJuUklBQkpMQ2hka1pXeGxkR1ZmYldsemMybHNaVjkzWVhsd2IybHVkQmdWSUFFb0N6SW9MbXhwWjJoMGMzQmxaV1JrZFdWc0xuZHpMa1JsYkdWMFpVMXBjM05wYkdWWFlYbHdiMmx1ZEVnQUVrTUtFMk5zWldGeVgyMXBjM05wYkdWZmNtOTFkR1VZRmlBQktBc3lKQzVzYVdkb2RITndaV1ZrWkhWbGJDNTNjeTVEYkdWaGNrMXBjM05wYkdWU2IzVjBaVWdBRWo4S0VXRmtaRjl0YVhOemFXeGxYM0p2ZFhSbEdCY2dBU2dMTWlJdWJHbG5hSFJ6Y0dWbFpHUjFaV3d1ZDNNdVFXUmtUV2x6YzJsc1pWSnZkWFJsU0FBU1JRb1VjbVZ1WVcxbFgyMXBjM05wYkdWZmNtOTFkR1VZR0NBQktBc3lKUzVzYVdkb2RITndaV1ZrWkhWbGJDNTNjeTVTWlc1aGJXVk5hWE56YVd4bFVtOTFkR1ZJQUJKRkNoUmtaV3hsZEdWZmJXbHpjMmxzWlY5eWIzVjBaUmdaSUFFb0N6SWxMbXhwWjJoMGMzQmxaV1JrZFdWc0xuZHpMa1JsYkdWMFpVMXBjM05wYkdWU2IzVjBaVWdBRWt3S0dITmxkRjloWTNScGRtVmZiV2x6YzJsc1pWOXliM1YwWlJnYUlBRW9DeklvTG14cFoyaDBjM0JsWldSa2RXVnNMbmR6TGxObGRFRmpkR2wyWlUxcGMzTnBiR1ZTYjNWMFpVZ0FFam9LRG14aGRXNWphRjl0YVhOemFXeGxHQnNnQVNnTE1pQXViR2xuYUhSemNHVmxaR1IxWld3dWQzTXVUR0YxYm1Ob1RXbHpjMmxzWlVnQUVqQUtDV1JoWjE5emRHRnlkQmdlSUFFb0N6SWJMbXhwWjJoMGMzQmxaV1JrZFdWc0xuZHpMa1JoWjFOMFlYSjBTQUFTTWdvS1pHRm5YMk5oYm1ObGJCZ2ZJQUVvQ3pJY0xteHBaMmgwYzNCbFpXUmtkV1ZzTG5kekxrUmhaME5oYm1ObGJFZ0FFamNLRFdSaFoxOXpkRzl5ZVY5aFkyc1lJQ0FCS0FzeUhpNXNhV2RvZEhOd1pXVmtaSFZsYkM1M2N5NUVZV2RUZEc5eWVVRmphMGdBRWk0S0NHUmhaMTlzYVhOMEdDRWdBU2dMTWhvdWJHbG5hSFJ6Y0dWbFpHUjFaV3d1ZDNNdVJHRm5UR2x6ZEVnQUVrRUtFbTFwYzNOcGIyNWZjM0JoZDI1ZmQyRjJaUmdvSUFFb0N6SWpMbXhwWjJoMGMzQmxaV1JrZFdWc0xuZHpMazFwYzNOcGIyNVRjR0YzYmxkaGRtVklBQkpEQ2hOdGFYTnphVzl1WDNOMGIzSjVYMlYyWlc1MEdDa2dBU2dMTWlRdWJHbG5hSFJ6Y0dWbFpHUjFaV3d1ZDNNdVRXbHpjMmx2YmxOMGIzSjVSWFpsYm5SSUFCSS9DaEZrWVdkZmJHbHpkRjl5WlhOd2IyNXpaUmd5SUFFb0N6SWlMbXhwWjJoMGMzQmxaV1JrZFdWc0xuZHpMa1JoWjB4cGMzUlNaWE53YjI1elpVZ0FRZ2tLQjNCaGVXeHZZV1Fpc3dVS0MxTjBZWFJsVlhCa1lYUmxFZ3NLQTI1dmR4Z0JJQUVvQVJJa0NnSnRaUmdDSUFFb0N6SVlMbXhwWjJoMGMzQmxaV1JrZFdWc0xuZHpMa2RvYjNOMEVpZ0tCbWRvYjNOMGN4Z0RJQU1vQ3pJWUxteHBaMmgwYzNCbFpXUmtkV1ZzTG5kekxrZG9iM04wRWlrS0JHMWxkR0VZQkNBQktBc3lHeTVzYVdkb2RITndaV1ZrWkhWbGJDNTNjeTVTYjI5dFRXVjBZUklzQ2dodGFYTnphV3hsY3hnRklBTW9DeklhTG14cFoyaDBjM0JsWldSa2RXVnNMbmR6TGsxcGMzTnBiR1VTT0FvT2JXbHpjMmxzWlY5amIyNW1hV2NZQmlBQktBc3lJQzVzYVdkb2RITndaV1ZrWkhWbGJDNTNjeTVOYVhOemFXeGxRMjl1Wm1sbkVqWUtFVzFwYzNOcGJHVmZkMkY1Y0c5cGJuUnpHQWNnQXlnTE1oc3ViR2xuYUhSemNHVmxaR1IxWld3dWQzTXVWMkY1Y0c5cGJuUVNOd29PYldsemMybHNaVjl5YjNWMFpYTVlDQ0FES0FzeUh5NXNhV2RvZEhOd1pXVmtaSFZsYkM1M2N5NU5hWE56YVd4bFVtOTFkR1VTSEFvVVlXTjBhWFpsWDIxcGMzTnBiR1ZmY205MWRHVVlDU0FCS0FrU0dnb1NibVY0ZEY5dGFYTnphV3hsWDNKbFlXUjVHQW9nQVNnQkVpMEtBMlJoWnhnTElBRW9DekliTG14cFoyaDBjM0JsWldSa2RXVnNMbmR6TGtSaFoxTjBZWFJsU0FDSUFRRVNOQW9KYVc1MlpXNTBiM0o1R0F3Z0FTZ0xNaHd1YkdsbmFIUnpjR1ZsWkdSMVpXd3VkM011U1c1MlpXNTBiM0o1U0FHSUFRRVNNUW9GYzNSdmNua1lEU0FCS0FzeUhTNXNhV2RvZEhOd1pXVmtaSFZsYkM1M2N5NVRkRzl5ZVZOMFlYUmxTQUtJQVFFU1FBb01ZMkZ3WVdKcGJHbDBhV1Z6R0E0Z0FTZ0xNaVV1YkdsbmFIUnpjR1ZsWkdSMVpXd3VkM011VUd4aGVXVnlRMkZ3WVdKcGJHbDBhV1Z6U0FPSUFRRkNCZ29FWDJSaFowSU1DZ3BmYVc1MlpXNTBiM0o1UWdnS0JsOXpkRzl5ZVVJUENnMWZZMkZ3WVdKcGJHbDBhV1Z6SWlBS0RWSnZiMjFHZFd4c1JYSnliM0lTRHdvSGJXVnpjMkZuWlJnQklBRW9DU0pHQ2dwRGJHbGxiblJLYjJsdUVnd0tCRzVoYldVWUFTQUJLQWtTREFvRWNtOXZiUmdDSUFFb0NSSU5DZ1Z0WVhCZmR4Z0RJQUVvQVJJTkNnVnRZWEJmYUJnRUlBRW9BU0lLQ2doVGNHRjNia0p2ZENJeUNndEJaR1JYWVhsd2IybHVkQklKQ2dGNEdBRWdBU2dCRWdrS0FYa1lBaUFCS0FFU0RRb0ZjM0JsWldRWUF5QUJLQUVpTGdvT1ZYQmtZWFJsVjJGNWNHOXBiblFTRFFvRmFXNWtaWGdZQVNBQktBVVNEUW9GYzNCbFpXUVlBaUFCS0FFaU13b01UVzkyWlZkaGVYQnZhVzUwRWcwS0JXbHVaR1Y0R0FFZ0FTZ0ZFZ2tLQVhnWUFpQUJLQUVTQ1FvQmVSZ0RJQUVvQVNJZkNnNUVaV3hsZEdWWFlYbHdiMmx1ZEJJTkNnVnBibVJsZUJnQklBRW9CU0lRQ2c1RGJHVmhjbGRoZVhCdmFXNTBjeUkvQ2hCRGIyNW1hV2QxY21WTmFYTnphV3hsRWhVS0RXMXBjM05wYkdWZmMzQmxaV1FZQVNBQktBRVNGQW9NYldsemMybHNaVjloWjNKdkdBSWdBU2dCSWtzS0VrRmtaRTFwYzNOcGJHVlhZWGx3YjJsdWRCSVFDZ2h5YjNWMFpWOXBaQmdCSUFFb0NSSUpDZ0Y0R0FJZ0FTZ0JFZ2tLQVhrWUF5QUJLQUVTRFFvRmMzQmxaV1FZQkNBQktBRWlUQW9hVlhCa1lYUmxUV2x6YzJsc1pWZGhlWEJ2YVc1MFUzQmxaV1FTRUFvSWNtOTFkR1ZmYVdRWUFTQUJLQWtTRFFvRmFXNWtaWGdZQWlBQktBVVNEUW9GYzNCbFpXUVlBeUFCS0FFaVRBb1RUVzkyWlUxcGMzTnBiR1ZYWVhsd2IybHVkQklRQ2doeWIzVjBaVjlwWkJnQklBRW9DUklOQ2dWcGJtUmxlQmdDSUFFb0JSSUpDZ0Y0R0FNZ0FTZ0JFZ2tLQVhrWUJDQUJLQUVpT0FvVlJHVnNaWFJsVFdsemMybHNaVmRoZVhCdmFXNTBFaEFLQ0hKdmRYUmxYMmxrR0FFZ0FTZ0pFZzBLQldsdVpHVjRHQUlnQVNnRklpVUtFVU5zWldGeVRXbHpjMmxzWlZKdmRYUmxFaEFLQ0hKdmRYUmxYMmxrR0FFZ0FTZ0pJaDhLRDBGa1pFMXBjM05wYkdWU2IzVjBaUklNQ2dSdVlXMWxHQUVnQVNnSklqUUtFbEpsYm1GdFpVMXBjM05wYkdWU2IzVjBaUklRQ2doeWIzVjBaVjlwWkJnQklBRW9DUklNQ2dSdVlXMWxHQUlnQVNnSklpWUtFa1JsYkdWMFpVMXBjM05wYkdWU2IzVjBaUklRQ2doeWIzVjBaVjlwWkJnQklBRW9DU0lwQ2hWVFpYUkJZM1JwZG1WTmFYTnphV3hsVW05MWRHVVNFQW9JY205MWRHVmZhV1FZQVNBQktBa2lJUW9OVEdGMWJtTm9UV2x6YzJsc1pSSVFDZ2h5YjNWMFpWOXBaQmdCSUFFb0NTS0NBZ29GUjJodmMzUVNDZ29DYVdRWUFTQUJLQWtTQ1FvQmVCZ0NJQUVvQVJJSkNnRjVHQU1nQVNnQkVnb0tBblo0R0FRZ0FTZ0JFZ29LQW5aNUdBVWdBU2dCRWdrS0FYUVlCaUFCS0FFU0RBb0VjMlZzWmhnSElBRW9DQkl1Q2dsM1lYbHdiMmx1ZEhNWUNDQURLQXN5R3k1c2FXZG9kSE53WldWa1pIVmxiQzUzY3k1WFlYbHdiMmx1ZEJJZUNoWmpkWEp5Wlc1MFgzZGhlWEJ2YVc1MFgybHVaR1Y0R0FrZ0FTZ0ZFZ29LQW1od0dBb2dBU2dGRWcwS0JXdHBiR3h6R0FzZ0FTZ0ZFaklLQkdobFlYUVlEQ0FCS0FzeUh5NXNhV2RvZEhOd1pXVmtaSFZsYkM1M2N5NVRhR2x3U0dWaGRGWnBaWGRJQUlnQkFVSUhDZ1ZmYUdWaGRDSXZDZ2hYWVhsd2IybHVkQklKQ2dGNEdBRWdBU2dCRWdrS0FYa1lBaUFCS0FFU0RRb0ZjM0JsWldRWUF5QUJLQUVpS3dvSVVtOXZiVTFsZEdFU0NRb0JZeGdCSUFFb0FSSUpDZ0YzR0FJZ0FTZ0JFZ2tLQVdnWUF5QUJLQUVpaXdJS0IwMXBjM05wYkdVU0Nnb0NhV1FZQVNBQktBa1NEUW9GYjNkdVpYSVlBaUFCS0FrU0RBb0VjMlZzWmhnRElBRW9DQklKQ2dGNEdBUWdBU2dCRWdrS0FYa1lCU0FCS0FFU0Nnb0NkbmdZQmlBQktBRVNDZ29DZG5rWUJ5QUJLQUVTQ1FvQmRCZ0lJQUVvQVJJVENndGhaM0p2WDNKaFpHbDFjeGdKSUFFb0FSSVFDZ2hzYVdabGRHbHRaUmdLSUFFb0FSSVRDZ3RzWVhWdVkyaGZkR2x0WlJnTElBRW9BUklTQ2dwbGVIQnBjbVZ6WDJGMEdBd2dBU2dCRWhFS0NYUmhjbWRsZEY5cFpCZ05JQUVvQ1JJeUNnUm9aV0YwR0E0Z0FTZ0xNaDh1YkdsbmFIUnpjR1ZsWkdSMVpXd3VkM011VTJocGNFaGxZWFJXYVdWM1NBQ0lBUUZDQndvRlgyaGxZWFFpeGdFS0RVMXBjM05wYkdWRGIyNW1hV2NTRFFvRmMzQmxaV1FZQVNBQktBRVNFUW9KYzNCbFpXUmZiV2x1R0FJZ0FTZ0JFaEVLQ1hOd1pXVmtYMjFoZUJnRElBRW9BUklRQ2doaFozSnZYMjFwYmhnRUlBRW9BUklUQ2d0aFozSnZYM0poWkdsMWN4Z0ZJQUVvQVJJUUNnaHNhV1psZEdsdFpSZ0dJQUVvQVJJM0NndG9aV0YwWDJOdmJtWnBaeGdISUFFb0N6SWRMbXhwWjJoMGMzQmxaV1JrZFdWc0xuZHpMa2hsWVhSUVlYSmhiWE5JQUlnQkFVSU9DZ3hmYUdWaGRGOWpiMjVtYVdjaVdBb01UV2x6YzJsc1pWSnZkWFJsRWdvS0FtbGtHQUVnQVNnSkVnd0tCRzVoYldVWUFpQUJLQWtTTGdvSmQyRjVjRzlwYm5SekdBTWdBeWdMTWhzdWJHbG5hSFJ6Y0dWbFpHUjFaV3d1ZDNNdVYyRjVjRzlwYm5RaWRnb01VMmhwY0VobFlYUldhV1YzRWdrS0FYWVlBU0FCS0FFU0NRb0JiUmdDSUFFb0FSSUpDZ0YzR0FNZ0FTZ0JFZ2tLQVc4WUJDQUJLQUVTQ2dvQ2JYTVlCU0FCS0FFU0Nnb0NjM1VZQmlBQktBRVNDZ29DYTNVWUJ5QUJLQUVTQ2dvQ2EyUVlDQ0FCS0FFU0Nnb0NaWGdZQ1NBQktBRWlnQUVLQ2tobFlYUlFZWEpoYlhNU0N3b0RiV0Y0R0FFZ0FTZ0JFZzhLQjNkaGNtNWZZWFFZQWlBQktBRVNFd29MYjNabGNtaGxZWFJmWVhRWUF5QUJLQUVTRkFvTWJXRnlhMlZ5WDNOd1pXVmtHQVFnQVNnQkVnd0tCR3RmZFhBWUJTQUJLQUVTRGdvR2ExOWtiM2R1R0FZZ0FTZ0JFZ3NLQTJWNGNCZ0hJQUVvQVNKM0NnMVZjR2R5WVdSbFJXWm1aV04wRWpJS0JIUjVjR1VZQVNBQktBNHlKQzVzYVdkb2RITndaV1ZrWkhWbGJDNTNjeTVWY0dkeVlXUmxSV1ptWldOMFZIbHdaUklVQ2dwdGRXeDBhWEJzYVdWeUdBSWdBU2dCU0FBU0V3b0pkVzVzYjJOclgybGtHQU1nQVNnSlNBQkNCd29GZG1Gc2RXVWllUW9TVUd4aGVXVnlRMkZ3WVdKcGJHbDBhV1Z6RWhnS0VITndaV1ZrWDIxMWJIUnBjR3hwWlhJWUFTQUJLQUVTR1FvUmRXNXNiMk5yWldSZmJXbHpjMmxzWlhNWUFpQURLQWtTRlFvTmFHVmhkRjlqWVhCaFkybDBlUmdESUFFb0FSSVhDZzlvWldGMFgyVm1abWxqYVdWdVkza1lCQ0FCS0FFaTlBRUtCMFJoWjA1dlpHVVNDZ29DYVdRWUFTQUJLQWtTTEFvRWEybHVaQmdDSUFFb0RqSWVMbXhwWjJoMGMzQmxaV1JrZFdWc0xuZHpMa1JoWjA1dlpHVkxhVzVrRWcwS0JXeGhZbVZzR0FNZ0FTZ0pFakFLQm5OMFlYUjFjeGdFSUFFb0RqSWdMbXhwWjJoMGMzQmxaV1JrZFdWc0xuZHpMa1JoWjA1dlpHVlRkR0YwZFhNU0V3b0xjbVZ0WVdsdWFXNW5YM01ZQlNBQktBRVNFZ29LWkhWeVlYUnBiMjVmY3hnR0lBRW9BUklTQ2dweVpYQmxZWFJoWW14bEdBY2dBU2dJRWpFS0IyVm1abVZqZEhNWUNDQURLQXN5SUM1c2FXZG9kSE53WldWa1pIVmxiQzUzY3k1VmNHZHlZV1JsUldabVpXTjBJalVLQ0VSaFoxTjBZWFJsRWlrS0JXNXZaR1Z6R0FFZ0F5Z0xNaG91YkdsbmFIUnpjR1ZsWkdSMVpXd3VkM011UkdGblRtOWtaU0liQ2doRVlXZFRkR0Z5ZEJJUENnZHViMlJsWDJsa0dBRWdBU2dKSWh3S0NVUmhaME5oYm1ObGJCSVBDZ2R1YjJSbFgybGtHQUVnQVNnSklqRUtDMFJoWjFOMGIzSjVRV05yRWc4S0IyNXZaR1ZmYVdRWUFTQUJLQWtTRVFvSlkyaHZhV05sWDJsa0dBSWdBU2dKSWdrS0IwUmhaMHhwYzNRaU93b1BSR0ZuVEdsemRGSmxjM0J2Ym5ObEVpZ0tBMlJoWnhnQklBRW9DekliTG14cFoyaDBjM0JsWldSa2RXVnNMbmR6TGtSaFoxTjBZWFJsSWxvS0RVbHVkbVZ1ZEc5eWVVbDBaVzBTREFvRWRIbHdaUmdCSUFFb0NSSVNDZ3AyWVhKcFlXNTBYMmxrR0FJZ0FTZ0pFaFVLRFdobFlYUmZZMkZ3WVdOcGRIa1lBeUFCS0FFU0VBb0ljWFZoYm5ScGRIa1lCQ0FCS0FVaVBBb0pTVzUyWlc1MGIzSjVFaThLQldsMFpXMXpHQUVnQXlnTE1pQXViR2xuYUhSemNHVmxaR1IxWld3dWQzTXVTVzUyWlc1MGIzSjVTWFJsYlNJdkNoTlRkRzl5ZVVScFlXeHZaM1ZsUTJodmFXTmxFZ29LQW1sa0dBRWdBU2dKRWd3S0JIUmxlSFFZQWlBQktBa2lMd29RVTNSdmNubFVkWFJ2Y21saGJGUnBjQklOQ2dWMGFYUnNaUmdCSUFFb0NSSU1DZ1IwWlhoMEdBSWdBU2dKSW9BQ0NnMVRkRzl5ZVVScFlXeHZaM1ZsRWc4S0IzTndaV0ZyWlhJWUFTQUJLQWtTREFvRWRHVjRkQmdDSUFFb0NSSXVDZ1pwYm5SbGJuUVlBeUFCS0E0eUhpNXNhV2RvZEhOd1pXVmtaSFZsYkM1M2N5NVRkRzl5ZVVsdWRHVnVkQklXQ2c1amIyNTBhVzUxWlY5c1lXSmxiQmdFSUFFb0NSSTNDZ2RqYUc5cFkyVnpHQVVnQXlnTE1pWXViR2xuYUhSemNHVmxaR1IxWld3dWQzTXVVM1J2Y25sRWFXRnNiMmQxWlVOb2IybGpaUkkrQ2d4MGRYUnZjbWxoYkY5MGFYQVlCaUFCS0FzeUl5NXNhV2RvZEhOd1pXVmtaSFZsYkM1M2N5NVRkRzl5ZVZSMWRHOXlhV0ZzVkdsd1NBQ0lBUUZDRHdvTlgzUjFkRzl5YVdGc1gzUnBjQ0pFQ2dwVGRHOXllVVYyWlc1MEVoSUtDbU5vWVhCMFpYSmZhV1FZQVNBQktBa1NEd29IYm05a1pWOXBaQmdDSUFFb0NSSVJDZ2wwYVcxbGMzUmhiWEFZQXlBQktBRWlsd0lLQ2xOMGIzSjVVM1JoZEdVU0V3b0xZV04wYVhabFgyNXZaR1VZQVNBQktBa1NOd29JWkdsaGJHOW5kV1VZQWlBQktBc3lJQzVzYVdkb2RITndaV1ZrWkhWbGJDNTNjeTVUZEc5eWVVUnBZV3h2WjNWbFNBQ0lBUUVTRVFvSllYWmhhV3hoWW14bEdBTWdBeWdKRWpjS0JXWnNZV2R6R0FRZ0F5Z0xNaWd1YkdsbmFIUnpjR1ZsWkdSMVpXd3VkM011VTNSdmNubFRkR0YwWlM1R2JHRm5jMFZ1ZEhKNUVqUUtEWEpsWTJWdWRGOWxkbVZ1ZEhNWUJTQURLQXN5SFM1c2FXZG9kSE53WldWa1pIVmxiQzUzY3k1VGRHOXllVVYyWlc1MEdpd0tDa1pzWVdkelJXNTBjbmtTQ3dvRGEyVjVHQUVnQVNnSkVnMEtCWFpoYkhWbEdBSWdBU2dJT2dJNEFVSUxDZ2xmWkdsaGJHOW5kV1VpSmdvUVRXbHpjMmx2YmxOd1lYZHVWMkYyWlJJU0NncDNZWFpsWDJsdVpHVjRHQUVnQVNnRklqSUtFVTFwYzNOcGIyNVRkRzl5ZVVWMlpXNTBFZzBLQldWMlpXNTBHQUVnQVNnSkVnNEtCbUpsWVdOdmJoZ0NJQUVvQlNxckFRb05SR0ZuVG05a1pWTjBZWFIxY3hJZkNodEVRVWRmVGs5RVJWOVRWRUZVVlZOZlZVNVRVRVZEU1VaSlJVUVFBQklhQ2haRVFVZGZUazlFUlY5VFZFRlVWVk5mVEU5RFMwVkVFQUVTSFFvWlJFRkhYMDVQUkVWZlUxUkJWRlZUWDBGV1FVbE1RVUpNUlJBQ0VoOEtHMFJCUjE5T1QwUkZYMU5VUVZSVlUxOUpUbDlRVWs5SFVrVlRVeEFERWgwS0dVUkJSMTlPVDBSRlgxTlVRVlJWVTE5RFQwMVFURVZVUlVRUUJDcVJBUW9MUkdGblRtOWtaVXRwYm1RU0hRb1pSRUZIWDA1UFJFVmZTMGxPUkY5VlRsTlFSVU5KUmtsRlJCQUFFaGtLRlVSQlIxOU9UMFJGWDB0SlRrUmZSa0ZEVkU5U1dSQUJFaFlLRWtSQlIxOU9UMFJGWDB0SlRrUmZWVTVKVkJBQ0VoY0tFMFJCUjE5T1QwUkZYMHRKVGtSZlUxUlBVbGtRQXhJWENoTkVRVWRmVGs5RVJWOUxTVTVFWDBOU1FVWlVFQVFxMmdFS0VWVndaM0poWkdWRlptWmxZM1JVZVhCbEVpTUtIMVZRUjFKQlJFVmZSVVpHUlVOVVgxUlpVRVZmVlU1VFVFVkRTVVpKUlVRUUFCSW9DaVJWVUVkU1FVUkZYMFZHUmtWRFZGOVVXVkJGWDFOUVJVVkVYMDFWVEZSSlVFeEpSVklRQVJJbUNpSlZVRWRTUVVSRlgwVkdSa1ZEVkY5VVdWQkZYMDFKVTFOSlRFVmZWVTVNVDBOTEVBSVNKUW9oVlZCSFVrRkVSVjlGUmtaRlExUmZWRmxRUlY5SVJVRlVYME5CVUVGRFNWUlpFQU1TSndvalZWQkhVa0ZFUlY5RlJrWkZRMVJmVkZsUVJWOUlSVUZVWDBWR1JrbERTVVZPUTFrUUJDcGNDZ3RUZEc5eWVVbHVkR1Z1ZEJJY0NoaFRWRTlTV1Y5SlRsUkZUbFJmVlU1VFVFVkRTVVpKUlVRUUFCSVlDaFJUVkU5U1dWOUpUbFJGVGxSZlJrRkRWRTlTV1JBQkVoVUtFVk5VVDFKWlgwbE9WRVZPVkY5VlRrbFVFQUpDSWxvZ1RHbG5hSFJUY0dWbFpFUjFaV3d2YVc1MFpYSnVZV3d2Y0hKdmRHOHZkM05pQm5CeWIzUnZNd1wiKTtcblxuLyoqXG4gKiBXc0VudmVsb3BlIHdyYXBzIGFsbCBXZWJTb2NrZXQgbWVzc2FnZXMgaW4gYSBkaXNjcmltaW5hdGVkIHVuaW9uXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuV3NFbnZlbG9wZVxuICovXG5leHBvcnQgdHlwZSBXc0VudmVsb3BlID0gTWVzc2FnZTxcImxpZ2h0c3BlZWRkdWVsLndzLldzRW52ZWxvcGVcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gb25lb2YgbGlnaHRzcGVlZGR1ZWwud3MuV3NFbnZlbG9wZS5wYXlsb2FkXG4gICAqL1xuICBwYXlsb2FkOiB7XG4gICAgLyoqXG4gICAgICogU2VydmVyIFx1MjE5MiBDbGllbnRcbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogbGlnaHRzcGVlZGR1ZWwud3MuU3RhdGVVcGRhdGUgc3RhdGVfdXBkYXRlID0gMTtcbiAgICAgKi9cbiAgICB2YWx1ZTogU3RhdGVVcGRhdGU7XG4gICAgY2FzZTogXCJzdGF0ZVVwZGF0ZVwiO1xuICB9IHwge1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogbGlnaHRzcGVlZGR1ZWwud3MuUm9vbUZ1bGxFcnJvciByb29tX2Z1bGwgPSAyO1xuICAgICAqL1xuICAgIHZhbHVlOiBSb29tRnVsbEVycm9yO1xuICAgIGNhc2U6IFwicm9vbUZ1bGxcIjtcbiAgfSB8IHtcbiAgICAvKipcbiAgICAgKiBDbGllbnQgXHUyMTkyIFNlcnZlclxuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5DbGllbnRKb2luIGpvaW4gPSAxMDtcbiAgICAgKi9cbiAgICB2YWx1ZTogQ2xpZW50Sm9pbjtcbiAgICBjYXNlOiBcImpvaW5cIjtcbiAgfSB8IHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLlNwYXduQm90IHNwYXduX2JvdCA9IDExO1xuICAgICAqL1xuICAgIHZhbHVlOiBTcGF3bkJvdDtcbiAgICBjYXNlOiBcInNwYXduQm90XCI7XG4gIH0gfCB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5BZGRXYXlwb2ludCBhZGRfd2F5cG9pbnQgPSAxMjtcbiAgICAgKi9cbiAgICB2YWx1ZTogQWRkV2F5cG9pbnQ7XG4gICAgY2FzZTogXCJhZGRXYXlwb2ludFwiO1xuICB9IHwge1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogbGlnaHRzcGVlZGR1ZWwud3MuVXBkYXRlV2F5cG9pbnQgdXBkYXRlX3dheXBvaW50ID0gMTM7XG4gICAgICovXG4gICAgdmFsdWU6IFVwZGF0ZVdheXBvaW50O1xuICAgIGNhc2U6IFwidXBkYXRlV2F5cG9pbnRcIjtcbiAgfSB8IHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLk1vdmVXYXlwb2ludCBtb3ZlX3dheXBvaW50ID0gMTQ7XG4gICAgICovXG4gICAgdmFsdWU6IE1vdmVXYXlwb2ludDtcbiAgICBjYXNlOiBcIm1vdmVXYXlwb2ludFwiO1xuICB9IHwge1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogbGlnaHRzcGVlZGR1ZWwud3MuRGVsZXRlV2F5cG9pbnQgZGVsZXRlX3dheXBvaW50ID0gMTU7XG4gICAgICovXG4gICAgdmFsdWU6IERlbGV0ZVdheXBvaW50O1xuICAgIGNhc2U6IFwiZGVsZXRlV2F5cG9pbnRcIjtcbiAgfSB8IHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLkNsZWFyV2F5cG9pbnRzIGNsZWFyX3dheXBvaW50cyA9IDE2O1xuICAgICAqL1xuICAgIHZhbHVlOiBDbGVhcldheXBvaW50cztcbiAgICBjYXNlOiBcImNsZWFyV2F5cG9pbnRzXCI7XG4gIH0gfCB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5Db25maWd1cmVNaXNzaWxlIGNvbmZpZ3VyZV9taXNzaWxlID0gMTc7XG4gICAgICovXG4gICAgdmFsdWU6IENvbmZpZ3VyZU1pc3NpbGU7XG4gICAgY2FzZTogXCJjb25maWd1cmVNaXNzaWxlXCI7XG4gIH0gfCB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5BZGRNaXNzaWxlV2F5cG9pbnQgYWRkX21pc3NpbGVfd2F5cG9pbnQgPSAxODtcbiAgICAgKi9cbiAgICB2YWx1ZTogQWRkTWlzc2lsZVdheXBvaW50O1xuICAgIGNhc2U6IFwiYWRkTWlzc2lsZVdheXBvaW50XCI7XG4gIH0gfCB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5VcGRhdGVNaXNzaWxlV2F5cG9pbnRTcGVlZCB1cGRhdGVfbWlzc2lsZV93YXlwb2ludF9zcGVlZCA9IDE5O1xuICAgICAqL1xuICAgIHZhbHVlOiBVcGRhdGVNaXNzaWxlV2F5cG9pbnRTcGVlZDtcbiAgICBjYXNlOiBcInVwZGF0ZU1pc3NpbGVXYXlwb2ludFNwZWVkXCI7XG4gIH0gfCB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5Nb3ZlTWlzc2lsZVdheXBvaW50IG1vdmVfbWlzc2lsZV93YXlwb2ludCA9IDIwO1xuICAgICAqL1xuICAgIHZhbHVlOiBNb3ZlTWlzc2lsZVdheXBvaW50O1xuICAgIGNhc2U6IFwibW92ZU1pc3NpbGVXYXlwb2ludFwiO1xuICB9IHwge1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogbGlnaHRzcGVlZGR1ZWwud3MuRGVsZXRlTWlzc2lsZVdheXBvaW50IGRlbGV0ZV9taXNzaWxlX3dheXBvaW50ID0gMjE7XG4gICAgICovXG4gICAgdmFsdWU6IERlbGV0ZU1pc3NpbGVXYXlwb2ludDtcbiAgICBjYXNlOiBcImRlbGV0ZU1pc3NpbGVXYXlwb2ludFwiO1xuICB9IHwge1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogbGlnaHRzcGVlZGR1ZWwud3MuQ2xlYXJNaXNzaWxlUm91dGUgY2xlYXJfbWlzc2lsZV9yb3V0ZSA9IDIyO1xuICAgICAqL1xuICAgIHZhbHVlOiBDbGVhck1pc3NpbGVSb3V0ZTtcbiAgICBjYXNlOiBcImNsZWFyTWlzc2lsZVJvdXRlXCI7XG4gIH0gfCB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5BZGRNaXNzaWxlUm91dGUgYWRkX21pc3NpbGVfcm91dGUgPSAyMztcbiAgICAgKi9cbiAgICB2YWx1ZTogQWRkTWlzc2lsZVJvdXRlO1xuICAgIGNhc2U6IFwiYWRkTWlzc2lsZVJvdXRlXCI7XG4gIH0gfCB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5SZW5hbWVNaXNzaWxlUm91dGUgcmVuYW1lX21pc3NpbGVfcm91dGUgPSAyNDtcbiAgICAgKi9cbiAgICB2YWx1ZTogUmVuYW1lTWlzc2lsZVJvdXRlO1xuICAgIGNhc2U6IFwicmVuYW1lTWlzc2lsZVJvdXRlXCI7XG4gIH0gfCB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5EZWxldGVNaXNzaWxlUm91dGUgZGVsZXRlX21pc3NpbGVfcm91dGUgPSAyNTtcbiAgICAgKi9cbiAgICB2YWx1ZTogRGVsZXRlTWlzc2lsZVJvdXRlO1xuICAgIGNhc2U6IFwiZGVsZXRlTWlzc2lsZVJvdXRlXCI7XG4gIH0gfCB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5TZXRBY3RpdmVNaXNzaWxlUm91dGUgc2V0X2FjdGl2ZV9taXNzaWxlX3JvdXRlID0gMjY7XG4gICAgICovXG4gICAgdmFsdWU6IFNldEFjdGl2ZU1pc3NpbGVSb3V0ZTtcbiAgICBjYXNlOiBcInNldEFjdGl2ZU1pc3NpbGVSb3V0ZVwiO1xuICB9IHwge1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogbGlnaHRzcGVlZGR1ZWwud3MuTGF1bmNoTWlzc2lsZSBsYXVuY2hfbWlzc2lsZSA9IDI3O1xuICAgICAqL1xuICAgIHZhbHVlOiBMYXVuY2hNaXNzaWxlO1xuICAgIGNhc2U6IFwibGF1bmNoTWlzc2lsZVwiO1xuICB9IHwge1xuICAgIC8qKlxuICAgICAqIFBoYXNlIDI6IERBRyBjb21tYW5kc1xuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5EYWdTdGFydCBkYWdfc3RhcnQgPSAzMDtcbiAgICAgKi9cbiAgICB2YWx1ZTogRGFnU3RhcnQ7XG4gICAgY2FzZTogXCJkYWdTdGFydFwiO1xuICB9IHwge1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogbGlnaHRzcGVlZGR1ZWwud3MuRGFnQ2FuY2VsIGRhZ19jYW5jZWwgPSAzMTtcbiAgICAgKi9cbiAgICB2YWx1ZTogRGFnQ2FuY2VsO1xuICAgIGNhc2U6IFwiZGFnQ2FuY2VsXCI7XG4gIH0gfCB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5EYWdTdG9yeUFjayBkYWdfc3RvcnlfYWNrID0gMzI7XG4gICAgICovXG4gICAgdmFsdWU6IERhZ1N0b3J5QWNrO1xuICAgIGNhc2U6IFwiZGFnU3RvcnlBY2tcIjtcbiAgfSB8IHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLkRhZ0xpc3QgZGFnX2xpc3QgPSAzMztcbiAgICAgKi9cbiAgICB2YWx1ZTogRGFnTGlzdDtcbiAgICBjYXNlOiBcImRhZ0xpc3RcIjtcbiAgfSB8IHtcbiAgICAvKipcbiAgICAgKiBQaGFzZSAyOiBNaXNzaW9uIGNvbW1hbmRzXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLk1pc3Npb25TcGF3bldhdmUgbWlzc2lvbl9zcGF3bl93YXZlID0gNDA7XG4gICAgICovXG4gICAgdmFsdWU6IE1pc3Npb25TcGF3bldhdmU7XG4gICAgY2FzZTogXCJtaXNzaW9uU3Bhd25XYXZlXCI7XG4gIH0gfCB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5NaXNzaW9uU3RvcnlFdmVudCBtaXNzaW9uX3N0b3J5X2V2ZW50ID0gNDE7XG4gICAgICovXG4gICAgdmFsdWU6IE1pc3Npb25TdG9yeUV2ZW50O1xuICAgIGNhc2U6IFwibWlzc2lvblN0b3J5RXZlbnRcIjtcbiAgfSB8IHtcbiAgICAvKipcbiAgICAgKiBQaGFzZSAyOiBTZXJ2ZXIgcmVzcG9uc2VzXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLkRhZ0xpc3RSZXNwb25zZSBkYWdfbGlzdF9yZXNwb25zZSA9IDUwO1xuICAgICAqL1xuICAgIHZhbHVlOiBEYWdMaXN0UmVzcG9uc2U7XG4gICAgY2FzZTogXCJkYWdMaXN0UmVzcG9uc2VcIjtcbiAgfSB8IHsgY2FzZTogdW5kZWZpbmVkOyB2YWx1ZT86IHVuZGVmaW5lZCB9O1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuV3NFbnZlbG9wZS5cbiAqIFVzZSBgY3JlYXRlKFdzRW52ZWxvcGVTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IFdzRW52ZWxvcGVTY2hlbWE6IEdlbk1lc3NhZ2U8V3NFbnZlbG9wZT4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDApO1xuXG4vKipcbiAqIFNlcnZlciBcdTIxOTIgQ2xpZW50OiBGdWxsIGdhbWUgc3RhdGVcbiAqIFNlbnQgZXZlcnkgdGljayAofjIwSHopIGNvbnRhaW5pbmcgdGhlIHBsYXllcidzIHZpZXcgb2YgdGhlIGdhbWUgd29ybGRcbiAqIHdpdGggbGlnaHQtZGVsYXllZCBwb3NpdGlvbnMgb2Ygb3RoZXIgc2hpcHMgYW5kIG1pc3NpbGVzXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuU3RhdGVVcGRhdGVcbiAqL1xuZXhwb3J0IHR5cGUgU3RhdGVVcGRhdGUgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuU3RhdGVVcGRhdGVcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBub3cgPSAxO1xuICAgKi9cbiAgbm93OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogbGlnaHRzcGVlZGR1ZWwud3MuR2hvc3QgbWUgPSAyO1xuICAgKi9cbiAgbWU/OiBHaG9zdDtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiByZXBlYXRlZCBsaWdodHNwZWVkZHVlbC53cy5HaG9zdCBnaG9zdHMgPSAzO1xuICAgKi9cbiAgZ2hvc3RzOiBHaG9zdFtdO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLlJvb21NZXRhIG1ldGEgPSA0O1xuICAgKi9cbiAgbWV0YT86IFJvb21NZXRhO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHJlcGVhdGVkIGxpZ2h0c3BlZWRkdWVsLndzLk1pc3NpbGUgbWlzc2lsZXMgPSA1O1xuICAgKi9cbiAgbWlzc2lsZXM6IE1pc3NpbGVbXTtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5NaXNzaWxlQ29uZmlnIG1pc3NpbGVfY29uZmlnID0gNjtcbiAgICovXG4gIG1pc3NpbGVDb25maWc/OiBNaXNzaWxlQ29uZmlnO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHJlcGVhdGVkIGxpZ2h0c3BlZWRkdWVsLndzLldheXBvaW50IG1pc3NpbGVfd2F5cG9pbnRzID0gNztcbiAgICovXG4gIG1pc3NpbGVXYXlwb2ludHM6IFdheXBvaW50W107XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogcmVwZWF0ZWQgbGlnaHRzcGVlZGR1ZWwud3MuTWlzc2lsZVJvdXRlIG1pc3NpbGVfcm91dGVzID0gODtcbiAgICovXG4gIG1pc3NpbGVSb3V0ZXM6IE1pc3NpbGVSb3V0ZVtdO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyBhY3RpdmVfbWlzc2lsZV9yb3V0ZSA9IDk7XG4gICAqL1xuICBhY3RpdmVNaXNzaWxlUm91dGU6IHN0cmluZztcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgbmV4dF9taXNzaWxlX3JlYWR5ID0gMTA7XG4gICAqL1xuICBuZXh0TWlzc2lsZVJlYWR5OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIFBoYXNlIDIgYWRkaXRpb25zOlxuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IG9wdGlvbmFsIGxpZ2h0c3BlZWRkdWVsLndzLkRhZ1N0YXRlIGRhZyA9IDExO1xuICAgKi9cbiAgZGFnPzogRGFnU3RhdGU7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogb3B0aW9uYWwgbGlnaHRzcGVlZGR1ZWwud3MuSW52ZW50b3J5IGludmVudG9yeSA9IDEyO1xuICAgKi9cbiAgaW52ZW50b3J5PzogSW52ZW50b3J5O1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IG9wdGlvbmFsIGxpZ2h0c3BlZWRkdWVsLndzLlN0b3J5U3RhdGUgc3RvcnkgPSAxMztcbiAgICovXG4gIHN0b3J5PzogU3RvcnlTdGF0ZTtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBvcHRpb25hbCBsaWdodHNwZWVkZHVlbC53cy5QbGF5ZXJDYXBhYmlsaXRpZXMgY2FwYWJpbGl0aWVzID0gMTQ7XG4gICAqL1xuICBjYXBhYmlsaXRpZXM/OiBQbGF5ZXJDYXBhYmlsaXRpZXM7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5TdGF0ZVVwZGF0ZS5cbiAqIFVzZSBgY3JlYXRlKFN0YXRlVXBkYXRlU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBTdGF0ZVVwZGF0ZVNjaGVtYTogR2VuTWVzc2FnZTxTdGF0ZVVwZGF0ZT4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDEpO1xuXG4vKipcbiAqIFNlcnZlciBcdTIxOTIgQ2xpZW50OiBSb29tIGZ1bGwgZXJyb3JcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5Sb29tRnVsbEVycm9yXG4gKi9cbmV4cG9ydCB0eXBlIFJvb21GdWxsRXJyb3IgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuUm9vbUZ1bGxFcnJvclwiPiAmIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIG1lc3NhZ2UgPSAxO1xuICAgKi9cbiAgbWVzc2FnZTogc3RyaW5nO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuUm9vbUZ1bGxFcnJvci5cbiAqIFVzZSBgY3JlYXRlKFJvb21GdWxsRXJyb3JTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IFJvb21GdWxsRXJyb3JTY2hlbWE6IEdlbk1lc3NhZ2U8Um9vbUZ1bGxFcnJvcj4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDIpO1xuXG4vKipcbiAqIENsaWVudCBcdTIxOTIgU2VydmVyOiBKb2luIGdhbWVcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5DbGllbnRKb2luXG4gKi9cbmV4cG9ydCB0eXBlIENsaWVudEpvaW4gPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuQ2xpZW50Sm9pblwiPiAmIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIG5hbWUgPSAxO1xuICAgKi9cbiAgbmFtZTogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyByb29tID0gMjtcbiAgICovXG4gIHJvb206IHN0cmluZztcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgbWFwX3cgPSAzO1xuICAgKi9cbiAgbWFwVzogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBtYXBfaCA9IDQ7XG4gICAqL1xuICBtYXBIOiBudW1iZXI7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5DbGllbnRKb2luLlxuICogVXNlIGBjcmVhdGUoQ2xpZW50Sm9pblNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgQ2xpZW50Sm9pblNjaGVtYTogR2VuTWVzc2FnZTxDbGllbnRKb2luPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMyk7XG5cbi8qKlxuICogQ2xpZW50IFx1MjE5MiBTZXJ2ZXI6IFNwYXduIEFJIGJvdFxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLlNwYXduQm90XG4gKi9cbmV4cG9ydCB0eXBlIFNwYXduQm90ID0gTWVzc2FnZTxcImxpZ2h0c3BlZWRkdWVsLndzLlNwYXduQm90XCI+ICYge1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuU3Bhd25Cb3QuXG4gKiBVc2UgYGNyZWF0ZShTcGF3bkJvdFNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgU3Bhd25Cb3RTY2hlbWE6IEdlbk1lc3NhZ2U8U3Bhd25Cb3Q+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCA0KTtcblxuLyoqXG4gKiBDbGllbnQgXHUyMTkyIFNlcnZlcjogQWRkIHdheXBvaW50IHRvIHNoaXAgcm91dGVcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5BZGRXYXlwb2ludFxuICovXG5leHBvcnQgdHlwZSBBZGRXYXlwb2ludCA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5BZGRXYXlwb2ludFwiPiAmIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHggPSAxO1xuICAgKi9cbiAgeDogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSB5ID0gMjtcbiAgICovXG4gIHk6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgc3BlZWQgPSAzO1xuICAgKi9cbiAgc3BlZWQ6IG51bWJlcjtcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkFkZFdheXBvaW50LlxuICogVXNlIGBjcmVhdGUoQWRkV2F5cG9pbnRTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEFkZFdheXBvaW50U2NoZW1hOiBHZW5NZXNzYWdlPEFkZFdheXBvaW50PiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgNSk7XG5cbi8qKlxuICogQ2xpZW50IFx1MjE5MiBTZXJ2ZXI6IFVwZGF0ZSB3YXlwb2ludCBzcGVlZFxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLlVwZGF0ZVdheXBvaW50XG4gKi9cbmV4cG9ydCB0eXBlIFVwZGF0ZVdheXBvaW50ID0gTWVzc2FnZTxcImxpZ2h0c3BlZWRkdWVsLndzLlVwZGF0ZVdheXBvaW50XCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBpbnQzMiBpbmRleCA9IDE7XG4gICAqL1xuICBpbmRleDogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBzcGVlZCA9IDI7XG4gICAqL1xuICBzcGVlZDogbnVtYmVyO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuVXBkYXRlV2F5cG9pbnQuXG4gKiBVc2UgYGNyZWF0ZShVcGRhdGVXYXlwb2ludFNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgVXBkYXRlV2F5cG9pbnRTY2hlbWE6IEdlbk1lc3NhZ2U8VXBkYXRlV2F5cG9pbnQ+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCA2KTtcblxuLyoqXG4gKiBDbGllbnQgXHUyMTkyIFNlcnZlcjogTW92ZSB3YXlwb2ludCBwb3NpdGlvblxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLk1vdmVXYXlwb2ludFxuICovXG5leHBvcnQgdHlwZSBNb3ZlV2F5cG9pbnQgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuTW92ZVdheXBvaW50XCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBpbnQzMiBpbmRleCA9IDE7XG4gICAqL1xuICBpbmRleDogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSB4ID0gMjtcbiAgICovXG4gIHg6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgeSA9IDM7XG4gICAqL1xuICB5OiBudW1iZXI7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5Nb3ZlV2F5cG9pbnQuXG4gKiBVc2UgYGNyZWF0ZShNb3ZlV2F5cG9pbnRTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IE1vdmVXYXlwb2ludFNjaGVtYTogR2VuTWVzc2FnZTxNb3ZlV2F5cG9pbnQ+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCA3KTtcblxuLyoqXG4gKiBDbGllbnQgXHUyMTkyIFNlcnZlcjogRGVsZXRlIHdheXBvaW50IGZyb20gcm91dGVcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5EZWxldGVXYXlwb2ludFxuICovXG5leHBvcnQgdHlwZSBEZWxldGVXYXlwb2ludCA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5EZWxldGVXYXlwb2ludFwiPiAmIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogaW50MzIgaW5kZXggPSAxO1xuICAgKi9cbiAgaW5kZXg6IG51bWJlcjtcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkRlbGV0ZVdheXBvaW50LlxuICogVXNlIGBjcmVhdGUoRGVsZXRlV2F5cG9pbnRTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IERlbGV0ZVdheXBvaW50U2NoZW1hOiBHZW5NZXNzYWdlPERlbGV0ZVdheXBvaW50PiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgOCk7XG5cbi8qKlxuICogQ2xpZW50IFx1MjE5MiBTZXJ2ZXI6IENsZWFyIGFsbCB3YXlwb2ludHNcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5DbGVhcldheXBvaW50c1xuICovXG5leHBvcnQgdHlwZSBDbGVhcldheXBvaW50cyA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5DbGVhcldheXBvaW50c1wiPiAmIHtcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkNsZWFyV2F5cG9pbnRzLlxuICogVXNlIGBjcmVhdGUoQ2xlYXJXYXlwb2ludHNTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IENsZWFyV2F5cG9pbnRzU2NoZW1hOiBHZW5NZXNzYWdlPENsZWFyV2F5cG9pbnRzPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgOSk7XG5cbi8qKlxuICogQ2xpZW50IFx1MjE5MiBTZXJ2ZXI6IENvbmZpZ3VyZSBtaXNzaWxlIHBhcmFtZXRlcnNcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5Db25maWd1cmVNaXNzaWxlXG4gKi9cbmV4cG9ydCB0eXBlIENvbmZpZ3VyZU1pc3NpbGUgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuQ29uZmlndXJlTWlzc2lsZVwiPiAmIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIG1pc3NpbGVfc3BlZWQgPSAxO1xuICAgKi9cbiAgbWlzc2lsZVNwZWVkOiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIG1pc3NpbGVfYWdybyA9IDI7XG4gICAqL1xuICBtaXNzaWxlQWdybzogbnVtYmVyO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuQ29uZmlndXJlTWlzc2lsZS5cbiAqIFVzZSBgY3JlYXRlKENvbmZpZ3VyZU1pc3NpbGVTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IENvbmZpZ3VyZU1pc3NpbGVTY2hlbWE6IEdlbk1lc3NhZ2U8Q29uZmlndXJlTWlzc2lsZT4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDEwKTtcblxuLyoqXG4gKiBDbGllbnQgXHUyMTkyIFNlcnZlcjogQWRkIHdheXBvaW50IHRvIG1pc3NpbGUgcm91dGVcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5BZGRNaXNzaWxlV2F5cG9pbnRcbiAqL1xuZXhwb3J0IHR5cGUgQWRkTWlzc2lsZVdheXBvaW50ID0gTWVzc2FnZTxcImxpZ2h0c3BlZWRkdWVsLndzLkFkZE1pc3NpbGVXYXlwb2ludFwiPiAmIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIHJvdXRlX2lkID0gMTtcbiAgICovXG4gIHJvdXRlSWQ6IHN0cmluZztcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgeCA9IDI7XG4gICAqL1xuICB4OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHkgPSAzO1xuICAgKi9cbiAgeTogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBzcGVlZCA9IDQ7XG4gICAqL1xuICBzcGVlZDogbnVtYmVyO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuQWRkTWlzc2lsZVdheXBvaW50LlxuICogVXNlIGBjcmVhdGUoQWRkTWlzc2lsZVdheXBvaW50U2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBBZGRNaXNzaWxlV2F5cG9pbnRTY2hlbWE6IEdlbk1lc3NhZ2U8QWRkTWlzc2lsZVdheXBvaW50PiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMTEpO1xuXG4vKipcbiAqIENsaWVudCBcdTIxOTIgU2VydmVyOiBVcGRhdGUgbWlzc2lsZSB3YXlwb2ludCBzcGVlZFxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLlVwZGF0ZU1pc3NpbGVXYXlwb2ludFNwZWVkXG4gKi9cbmV4cG9ydCB0eXBlIFVwZGF0ZU1pc3NpbGVXYXlwb2ludFNwZWVkID0gTWVzc2FnZTxcImxpZ2h0c3BlZWRkdWVsLndzLlVwZGF0ZU1pc3NpbGVXYXlwb2ludFNwZWVkXCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgcm91dGVfaWQgPSAxO1xuICAgKi9cbiAgcm91dGVJZDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGludDMyIGluZGV4ID0gMjtcbiAgICovXG4gIGluZGV4OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHNwZWVkID0gMztcbiAgICovXG4gIHNwZWVkOiBudW1iZXI7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5VcGRhdGVNaXNzaWxlV2F5cG9pbnRTcGVlZC5cbiAqIFVzZSBgY3JlYXRlKFVwZGF0ZU1pc3NpbGVXYXlwb2ludFNwZWVkU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBVcGRhdGVNaXNzaWxlV2F5cG9pbnRTcGVlZFNjaGVtYTogR2VuTWVzc2FnZTxVcGRhdGVNaXNzaWxlV2F5cG9pbnRTcGVlZD4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDEyKTtcblxuLyoqXG4gKiBDbGllbnQgXHUyMTkyIFNlcnZlcjogTW92ZSBtaXNzaWxlIHdheXBvaW50IHBvc2l0aW9uXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuTW92ZU1pc3NpbGVXYXlwb2ludFxuICovXG5leHBvcnQgdHlwZSBNb3ZlTWlzc2lsZVdheXBvaW50ID0gTWVzc2FnZTxcImxpZ2h0c3BlZWRkdWVsLndzLk1vdmVNaXNzaWxlV2F5cG9pbnRcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyByb3V0ZV9pZCA9IDE7XG4gICAqL1xuICByb3V0ZUlkOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogaW50MzIgaW5kZXggPSAyO1xuICAgKi9cbiAgaW5kZXg6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgeCA9IDM7XG4gICAqL1xuICB4OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHkgPSA0O1xuICAgKi9cbiAgeTogbnVtYmVyO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuTW92ZU1pc3NpbGVXYXlwb2ludC5cbiAqIFVzZSBgY3JlYXRlKE1vdmVNaXNzaWxlV2F5cG9pbnRTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IE1vdmVNaXNzaWxlV2F5cG9pbnRTY2hlbWE6IEdlbk1lc3NhZ2U8TW92ZU1pc3NpbGVXYXlwb2ludD4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDEzKTtcblxuLyoqXG4gKiBDbGllbnQgXHUyMTkyIFNlcnZlcjogRGVsZXRlIG1pc3NpbGUgd2F5cG9pbnRcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5EZWxldGVNaXNzaWxlV2F5cG9pbnRcbiAqL1xuZXhwb3J0IHR5cGUgRGVsZXRlTWlzc2lsZVdheXBvaW50ID0gTWVzc2FnZTxcImxpZ2h0c3BlZWRkdWVsLndzLkRlbGV0ZU1pc3NpbGVXYXlwb2ludFwiPiAmIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIHJvdXRlX2lkID0gMTtcbiAgICovXG4gIHJvdXRlSWQ6IHN0cmluZztcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBpbnQzMiBpbmRleCA9IDI7XG4gICAqL1xuICBpbmRleDogbnVtYmVyO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuRGVsZXRlTWlzc2lsZVdheXBvaW50LlxuICogVXNlIGBjcmVhdGUoRGVsZXRlTWlzc2lsZVdheXBvaW50U2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBEZWxldGVNaXNzaWxlV2F5cG9pbnRTY2hlbWE6IEdlbk1lc3NhZ2U8RGVsZXRlTWlzc2lsZVdheXBvaW50PiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMTQpO1xuXG4vKipcbiAqIENsaWVudCBcdTIxOTIgU2VydmVyOiBDbGVhciBtaXNzaWxlIHJvdXRlIHdheXBvaW50c1xuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkNsZWFyTWlzc2lsZVJvdXRlXG4gKi9cbmV4cG9ydCB0eXBlIENsZWFyTWlzc2lsZVJvdXRlID0gTWVzc2FnZTxcImxpZ2h0c3BlZWRkdWVsLndzLkNsZWFyTWlzc2lsZVJvdXRlXCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgcm91dGVfaWQgPSAxO1xuICAgKi9cbiAgcm91dGVJZDogc3RyaW5nO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuQ2xlYXJNaXNzaWxlUm91dGUuXG4gKiBVc2UgYGNyZWF0ZShDbGVhck1pc3NpbGVSb3V0ZVNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgQ2xlYXJNaXNzaWxlUm91dGVTY2hlbWE6IEdlbk1lc3NhZ2U8Q2xlYXJNaXNzaWxlUm91dGU+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCAxNSk7XG5cbi8qKlxuICogQ2xpZW50IFx1MjE5MiBTZXJ2ZXI6IENyZWF0ZSBuZXcgbWlzc2lsZSByb3V0ZVxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkFkZE1pc3NpbGVSb3V0ZVxuICovXG5leHBvcnQgdHlwZSBBZGRNaXNzaWxlUm91dGUgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuQWRkTWlzc2lsZVJvdXRlXCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgbmFtZSA9IDE7XG4gICAqL1xuICBuYW1lOiBzdHJpbmc7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5BZGRNaXNzaWxlUm91dGUuXG4gKiBVc2UgYGNyZWF0ZShBZGRNaXNzaWxlUm91dGVTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEFkZE1pc3NpbGVSb3V0ZVNjaGVtYTogR2VuTWVzc2FnZTxBZGRNaXNzaWxlUm91dGU+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCAxNik7XG5cbi8qKlxuICogQ2xpZW50IFx1MjE5MiBTZXJ2ZXI6IFJlbmFtZSBtaXNzaWxlIHJvdXRlXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuUmVuYW1lTWlzc2lsZVJvdXRlXG4gKi9cbmV4cG9ydCB0eXBlIFJlbmFtZU1pc3NpbGVSb3V0ZSA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5SZW5hbWVNaXNzaWxlUm91dGVcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyByb3V0ZV9pZCA9IDE7XG4gICAqL1xuICByb3V0ZUlkOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIG5hbWUgPSAyO1xuICAgKi9cbiAgbmFtZTogc3RyaW5nO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuUmVuYW1lTWlzc2lsZVJvdXRlLlxuICogVXNlIGBjcmVhdGUoUmVuYW1lTWlzc2lsZVJvdXRlU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBSZW5hbWVNaXNzaWxlUm91dGVTY2hlbWE6IEdlbk1lc3NhZ2U8UmVuYW1lTWlzc2lsZVJvdXRlPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMTcpO1xuXG4vKipcbiAqIENsaWVudCBcdTIxOTIgU2VydmVyOiBEZWxldGUgbWlzc2lsZSByb3V0ZVxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkRlbGV0ZU1pc3NpbGVSb3V0ZVxuICovXG5leHBvcnQgdHlwZSBEZWxldGVNaXNzaWxlUm91dGUgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuRGVsZXRlTWlzc2lsZVJvdXRlXCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgcm91dGVfaWQgPSAxO1xuICAgKi9cbiAgcm91dGVJZDogc3RyaW5nO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuRGVsZXRlTWlzc2lsZVJvdXRlLlxuICogVXNlIGBjcmVhdGUoRGVsZXRlTWlzc2lsZVJvdXRlU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBEZWxldGVNaXNzaWxlUm91dGVTY2hlbWE6IEdlbk1lc3NhZ2U8RGVsZXRlTWlzc2lsZVJvdXRlPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMTgpO1xuXG4vKipcbiAqIENsaWVudCBcdTIxOTIgU2VydmVyOiBTZXQgYWN0aXZlIG1pc3NpbGUgcm91dGVcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5TZXRBY3RpdmVNaXNzaWxlUm91dGVcbiAqL1xuZXhwb3J0IHR5cGUgU2V0QWN0aXZlTWlzc2lsZVJvdXRlID0gTWVzc2FnZTxcImxpZ2h0c3BlZWRkdWVsLndzLlNldEFjdGl2ZU1pc3NpbGVSb3V0ZVwiPiAmIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIHJvdXRlX2lkID0gMTtcbiAgICovXG4gIHJvdXRlSWQ6IHN0cmluZztcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLlNldEFjdGl2ZU1pc3NpbGVSb3V0ZS5cbiAqIFVzZSBgY3JlYXRlKFNldEFjdGl2ZU1pc3NpbGVSb3V0ZVNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgU2V0QWN0aXZlTWlzc2lsZVJvdXRlU2NoZW1hOiBHZW5NZXNzYWdlPFNldEFjdGl2ZU1pc3NpbGVSb3V0ZT4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDE5KTtcblxuLyoqXG4gKiBDbGllbnQgXHUyMTkyIFNlcnZlcjogTGF1bmNoIG1pc3NpbGUgb24gcm91dGVcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5MYXVuY2hNaXNzaWxlXG4gKi9cbmV4cG9ydCB0eXBlIExhdW5jaE1pc3NpbGUgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuTGF1bmNoTWlzc2lsZVwiPiAmIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIHJvdXRlX2lkID0gMTtcbiAgICovXG4gIHJvdXRlSWQ6IHN0cmluZztcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkxhdW5jaE1pc3NpbGUuXG4gKiBVc2UgYGNyZWF0ZShMYXVuY2hNaXNzaWxlU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBMYXVuY2hNaXNzaWxlU2NoZW1hOiBHZW5NZXNzYWdlPExhdW5jaE1pc3NpbGU+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCAyMCk7XG5cbi8qKlxuICogU2hpcC9naG9zdCBzbmFwc2hvdCB3aXRoIHBvc2l0aW9uLCB2ZWxvY2l0eSwgYW5kIHN0YXRlXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuR2hvc3RcbiAqL1xuZXhwb3J0IHR5cGUgR2hvc3QgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuR2hvc3RcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyBpZCA9IDE7XG4gICAqL1xuICBpZDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSB4ID0gMjtcbiAgICovXG4gIHg6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgeSA9IDM7XG4gICAqL1xuICB5OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHZ4ID0gNDtcbiAgICovXG4gIHZ4OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHZ5ID0gNTtcbiAgICovXG4gIHZ5OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHQgPSA2O1xuICAgKi9cbiAgdDogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGJvb2wgc2VsZiA9IDc7XG4gICAqL1xuICBzZWxmOiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHJlcGVhdGVkIGxpZ2h0c3BlZWRkdWVsLndzLldheXBvaW50IHdheXBvaW50cyA9IDg7XG4gICAqL1xuICB3YXlwb2ludHM6IFdheXBvaW50W107XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogaW50MzIgY3VycmVudF93YXlwb2ludF9pbmRleCA9IDk7XG4gICAqL1xuICBjdXJyZW50V2F5cG9pbnRJbmRleDogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGludDMyIGhwID0gMTA7XG4gICAqL1xuICBocDogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGludDMyIGtpbGxzID0gMTE7XG4gICAqL1xuICBraWxsczogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IG9wdGlvbmFsIGxpZ2h0c3BlZWRkdWVsLndzLlNoaXBIZWF0VmlldyBoZWF0ID0gMTI7XG4gICAqL1xuICBoZWF0PzogU2hpcEhlYXRWaWV3O1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuR2hvc3QuXG4gKiBVc2UgYGNyZWF0ZShHaG9zdFNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgR2hvc3RTY2hlbWE6IEdlbk1lc3NhZ2U8R2hvc3Q+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCAyMSk7XG5cbi8qKlxuICogV2F5cG9pbnQgd2l0aCBwb3NpdGlvbiBhbmQgdGFyZ2V0IHNwZWVkXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuV2F5cG9pbnRcbiAqL1xuZXhwb3J0IHR5cGUgV2F5cG9pbnQgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuV2F5cG9pbnRcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSB4ID0gMTtcbiAgICovXG4gIHg6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgeSA9IDI7XG4gICAqL1xuICB5OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHNwZWVkID0gMztcbiAgICovXG4gIHNwZWVkOiBudW1iZXI7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5XYXlwb2ludC5cbiAqIFVzZSBgY3JlYXRlKFdheXBvaW50U2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBXYXlwb2ludFNjaGVtYTogR2VuTWVzc2FnZTxXYXlwb2ludD4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDIyKTtcblxuLyoqXG4gKiBSb29tIGNvbnN0YW50cyAoc3BlZWQgb2YgbGlnaHQsIHdvcmxkIGRpbWVuc2lvbnMpXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuUm9vbU1ldGFcbiAqL1xuZXhwb3J0IHR5cGUgUm9vbU1ldGEgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuUm9vbU1ldGFcIj4gJiB7XG4gIC8qKlxuICAgKiBTcGVlZCBvZiBsaWdodFxuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBjID0gMTtcbiAgICovXG4gIGM6IG51bWJlcjtcblxuICAvKipcbiAgICogV29ybGQgd2lkdGhcbiAgICpcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgdyA9IDI7XG4gICAqL1xuICB3OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIFdvcmxkIGhlaWdodFxuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBoID0gMztcbiAgICovXG4gIGg6IG51bWJlcjtcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLlJvb21NZXRhLlxuICogVXNlIGBjcmVhdGUoUm9vbU1ldGFTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IFJvb21NZXRhU2NoZW1hOiBHZW5NZXNzYWdlPFJvb21NZXRhPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMjMpO1xuXG4vKipcbiAqIE1pc3NpbGUgc25hcHNob3Qgd2l0aCBwb3NpdGlvbiwgdmVsb2NpdHksIGFuZCB0YXJnZXRpbmdcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5NaXNzaWxlXG4gKi9cbmV4cG9ydCB0eXBlIE1pc3NpbGUgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuTWlzc2lsZVwiPiAmIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIGlkID0gMTtcbiAgICovXG4gIGlkOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIG93bmVyID0gMjtcbiAgICovXG4gIG93bmVyOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogYm9vbCBzZWxmID0gMztcbiAgICovXG4gIHNlbGY6IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHggPSA0O1xuICAgKi9cbiAgeDogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSB5ID0gNTtcbiAgICovXG4gIHk6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgdnggPSA2O1xuICAgKi9cbiAgdng6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgdnkgPSA3O1xuICAgKi9cbiAgdnk6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgdCA9IDg7XG4gICAqL1xuICB0OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIGFncm9fcmFkaXVzID0gOTtcbiAgICovXG4gIGFncm9SYWRpdXM6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgbGlmZXRpbWUgPSAxMDtcbiAgICovXG4gIGxpZmV0aW1lOiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIGxhdW5jaF90aW1lID0gMTE7XG4gICAqL1xuICBsYXVuY2hUaW1lOiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIGV4cGlyZXNfYXQgPSAxMjtcbiAgICovXG4gIGV4cGlyZXNBdDogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyB0YXJnZXRfaWQgPSAxMztcbiAgICovXG4gIHRhcmdldElkOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogb3B0aW9uYWwgbGlnaHRzcGVlZGR1ZWwud3MuU2hpcEhlYXRWaWV3IGhlYXQgPSAxNDtcbiAgICovXG4gIGhlYXQ/OiBTaGlwSGVhdFZpZXc7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5NaXNzaWxlLlxuICogVXNlIGBjcmVhdGUoTWlzc2lsZVNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgTWlzc2lsZVNjaGVtYTogR2VuTWVzc2FnZTxNaXNzaWxlPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMjQpO1xuXG4vKipcbiAqIE1pc3NpbGUgY29uZmlndXJhdGlvbiBwYXJhbWV0ZXJzXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuTWlzc2lsZUNvbmZpZ1xuICovXG5leHBvcnQgdHlwZSBNaXNzaWxlQ29uZmlnID0gTWVzc2FnZTxcImxpZ2h0c3BlZWRkdWVsLndzLk1pc3NpbGVDb25maWdcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBzcGVlZCA9IDE7XG4gICAqL1xuICBzcGVlZDogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBzcGVlZF9taW4gPSAyO1xuICAgKi9cbiAgc3BlZWRNaW46IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgc3BlZWRfbWF4ID0gMztcbiAgICovXG4gIHNwZWVkTWF4OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIGFncm9fbWluID0gNDtcbiAgICovXG4gIGFncm9NaW46IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgYWdyb19yYWRpdXMgPSA1O1xuICAgKi9cbiAgYWdyb1JhZGl1czogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBsaWZldGltZSA9IDY7XG4gICAqL1xuICBsaWZldGltZTogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IG9wdGlvbmFsIGxpZ2h0c3BlZWRkdWVsLndzLkhlYXRQYXJhbXMgaGVhdF9jb25maWcgPSA3O1xuICAgKi9cbiAgaGVhdENvbmZpZz86IEhlYXRQYXJhbXM7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5NaXNzaWxlQ29uZmlnLlxuICogVXNlIGBjcmVhdGUoTWlzc2lsZUNvbmZpZ1NjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgTWlzc2lsZUNvbmZpZ1NjaGVtYTogR2VuTWVzc2FnZTxNaXNzaWxlQ29uZmlnPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMjUpO1xuXG4vKipcbiAqIE1pc3NpbGUgcm91dGUgZGVmaW5pdGlvblxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLk1pc3NpbGVSb3V0ZVxuICovXG5leHBvcnQgdHlwZSBNaXNzaWxlUm91dGUgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuTWlzc2lsZVJvdXRlXCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgaWQgPSAxO1xuICAgKi9cbiAgaWQ6IHN0cmluZztcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgbmFtZSA9IDI7XG4gICAqL1xuICBuYW1lOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogcmVwZWF0ZWQgbGlnaHRzcGVlZGR1ZWwud3MuV2F5cG9pbnQgd2F5cG9pbnRzID0gMztcbiAgICovXG4gIHdheXBvaW50czogV2F5cG9pbnRbXTtcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLk1pc3NpbGVSb3V0ZS5cbiAqIFVzZSBgY3JlYXRlKE1pc3NpbGVSb3V0ZVNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgTWlzc2lsZVJvdXRlU2NoZW1hOiBHZW5NZXNzYWdlPE1pc3NpbGVSb3V0ZT4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDI2KTtcblxuLyoqXG4gKiBIZWF0IHZpZXcgKGFiYnJldmlhdGVkIGZpZWxkIG5hbWVzIG1hdGNoIEpTT04pXG4gKiBVc2VkIGZvciBib3RoIHNoaXBzIGFuZCBtaXNzaWxlc1xuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLlNoaXBIZWF0Vmlld1xuICovXG5leHBvcnQgdHlwZSBTaGlwSGVhdFZpZXcgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuU2hpcEhlYXRWaWV3XCI+ICYge1xuICAvKipcbiAgICogdmFsdWVcbiAgICpcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgdiA9IDE7XG4gICAqL1xuICB2OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIG1heFxuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBtID0gMjtcbiAgICovXG4gIG06IG51bWJlcjtcblxuICAvKipcbiAgICogd2FybkF0XG4gICAqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHcgPSAzO1xuICAgKi9cbiAgdzogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBvdmVyaGVhdEF0XG4gICAqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIG8gPSA0O1xuICAgKi9cbiAgbzogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBtYXJrZXJTcGVlZFxuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBtcyA9IDU7XG4gICAqL1xuICBtczogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBzdGFsbFVudGlsXG4gICAqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHN1ID0gNjtcbiAgICovXG4gIHN1OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIGtVcFxuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBrdSA9IDc7XG4gICAqL1xuICBrdTogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBrRG93blxuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBrZCA9IDg7XG4gICAqL1xuICBrZDogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBleHBcbiAgICpcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgZXggPSA5O1xuICAgKi9cbiAgZXg6IG51bWJlcjtcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLlNoaXBIZWF0Vmlldy5cbiAqIFVzZSBgY3JlYXRlKFNoaXBIZWF0Vmlld1NjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgU2hpcEhlYXRWaWV3U2NoZW1hOiBHZW5NZXNzYWdlPFNoaXBIZWF0Vmlldz4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDI3KTtcblxuLyoqXG4gKiBIZWF0IGNvbmZpZ3VyYXRpb24gcGFyYW1ldGVyc1xuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkhlYXRQYXJhbXNcbiAqL1xuZXhwb3J0IHR5cGUgSGVhdFBhcmFtcyA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5IZWF0UGFyYW1zXCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgbWF4ID0gMTtcbiAgICovXG4gIG1heDogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSB3YXJuX2F0ID0gMjtcbiAgICovXG4gIHdhcm5BdDogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBvdmVyaGVhdF9hdCA9IDM7XG4gICAqL1xuICBvdmVyaGVhdEF0OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIG1hcmtlcl9zcGVlZCA9IDQ7XG4gICAqL1xuICBtYXJrZXJTcGVlZDogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBrX3VwID0gNTtcbiAgICovXG4gIGtVcDogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBrX2Rvd24gPSA2O1xuICAgKi9cbiAga0Rvd246IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgZXhwID0gNztcbiAgICovXG4gIGV4cDogbnVtYmVyO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuSGVhdFBhcmFtcy5cbiAqIFVzZSBgY3JlYXRlKEhlYXRQYXJhbXNTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEhlYXRQYXJhbXNTY2hlbWE6IEdlbk1lc3NhZ2U8SGVhdFBhcmFtcz4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDI4KTtcblxuLyoqXG4gKiBVcGdyYWRlIGVmZmVjdCBkZWZpbml0aW9uXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuVXBncmFkZUVmZmVjdFxuICovXG5leHBvcnQgdHlwZSBVcGdyYWRlRWZmZWN0ID0gTWVzc2FnZTxcImxpZ2h0c3BlZWRkdWVsLndzLlVwZ3JhZGVFZmZlY3RcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLlVwZ3JhZGVFZmZlY3RUeXBlIHR5cGUgPSAxO1xuICAgKi9cbiAgdHlwZTogVXBncmFkZUVmZmVjdFR5cGU7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBvbmVvZiBsaWdodHNwZWVkZHVlbC53cy5VcGdyYWRlRWZmZWN0LnZhbHVlXG4gICAqL1xuICB2YWx1ZToge1xuICAgIC8qKlxuICAgICAqIEZvciBzcGVlZC9oZWF0IG11bHRpcGxpZXJzXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBtdWx0aXBsaWVyID0gMjtcbiAgICAgKi9cbiAgICB2YWx1ZTogbnVtYmVyO1xuICAgIGNhc2U6IFwibXVsdGlwbGllclwiO1xuICB9IHwge1xuICAgIC8qKlxuICAgICAqIEZvciBtaXNzaWxlIHVubG9ja3MgKGUuZy4sIFwic2NvdXRcIilcbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIHVubG9ja19pZCA9IDM7XG4gICAgICovXG4gICAgdmFsdWU6IHN0cmluZztcbiAgICBjYXNlOiBcInVubG9ja0lkXCI7XG4gIH0gfCB7IGNhc2U6IHVuZGVmaW5lZDsgdmFsdWU/OiB1bmRlZmluZWQgfTtcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLlVwZ3JhZGVFZmZlY3QuXG4gKiBVc2UgYGNyZWF0ZShVcGdyYWRlRWZmZWN0U2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBVcGdyYWRlRWZmZWN0U2NoZW1hOiBHZW5NZXNzYWdlPFVwZ3JhZGVFZmZlY3Q+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCAyOSk7XG5cbi8qKlxuICogUGxheWVyIGNhcGFiaWxpdGllcyAoY29tcHV0ZWQgZnJvbSBjb21wbGV0ZWQgdXBncmFkZXMpXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuUGxheWVyQ2FwYWJpbGl0aWVzXG4gKi9cbmV4cG9ydCB0eXBlIFBsYXllckNhcGFiaWxpdGllcyA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5QbGF5ZXJDYXBhYmlsaXRpZXNcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBzcGVlZF9tdWx0aXBsaWVyID0gMTtcbiAgICovXG4gIHNwZWVkTXVsdGlwbGllcjogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHJlcGVhdGVkIHN0cmluZyB1bmxvY2tlZF9taXNzaWxlcyA9IDI7XG4gICAqL1xuICB1bmxvY2tlZE1pc3NpbGVzOiBzdHJpbmdbXTtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgaGVhdF9jYXBhY2l0eSA9IDM7XG4gICAqL1xuICBoZWF0Q2FwYWNpdHk6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgaGVhdF9lZmZpY2llbmN5ID0gNDtcbiAgICovXG4gIGhlYXRFZmZpY2llbmN5OiBudW1iZXI7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5QbGF5ZXJDYXBhYmlsaXRpZXMuXG4gKiBVc2UgYGNyZWF0ZShQbGF5ZXJDYXBhYmlsaXRpZXNTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IFBsYXllckNhcGFiaWxpdGllc1NjaGVtYTogR2VuTWVzc2FnZTxQbGF5ZXJDYXBhYmlsaXRpZXM+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCAzMCk7XG5cbi8qKlxuICogREFHIG5vZGUgc3RhdGVcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5EYWdOb2RlXG4gKi9cbmV4cG9ydCB0eXBlIERhZ05vZGUgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuRGFnTm9kZVwiPiAmIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIGlkID0gMTtcbiAgICovXG4gIGlkOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogbGlnaHRzcGVlZGR1ZWwud3MuRGFnTm9kZUtpbmQga2luZCA9IDI7XG4gICAqL1xuICBraW5kOiBEYWdOb2RlS2luZDtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgbGFiZWwgPSAzO1xuICAgKi9cbiAgbGFiZWw6IHN0cmluZztcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5EYWdOb2RlU3RhdHVzIHN0YXR1cyA9IDQ7XG4gICAqL1xuICBzdGF0dXM6IERhZ05vZGVTdGF0dXM7XG5cbiAgLyoqXG4gICAqIFRpbWUgcmVtYWluaW5nIGZvciBpbi1wcm9ncmVzcyBqb2JzXG4gICAqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHJlbWFpbmluZ19zID0gNTtcbiAgICovXG4gIHJlbWFpbmluZ1M6IG51bWJlcjtcblxuICAvKipcbiAgICogVG90YWwgZHVyYXRpb25cbiAgICpcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgZHVyYXRpb25fcyA9IDY7XG4gICAqL1xuICBkdXJhdGlvblM6IG51bWJlcjtcblxuICAvKipcbiAgICogQ2FuIGJlIHJlcGVhdGVkIGFmdGVyIGNvbXBsZXRpb25cbiAgICpcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBib29sIHJlcGVhdGFibGUgPSA3O1xuICAgKi9cbiAgcmVwZWF0YWJsZTogYm9vbGVhbjtcblxuICAvKipcbiAgICogT25seSBwb3B1bGF0ZWQgZm9yIHVwZ3JhZGUgbm9kZXNcbiAgICpcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiByZXBlYXRlZCBsaWdodHNwZWVkZHVlbC53cy5VcGdyYWRlRWZmZWN0IGVmZmVjdHMgPSA4O1xuICAgKi9cbiAgZWZmZWN0czogVXBncmFkZUVmZmVjdFtdO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuRGFnTm9kZS5cbiAqIFVzZSBgY3JlYXRlKERhZ05vZGVTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IERhZ05vZGVTY2hlbWE6IEdlbk1lc3NhZ2U8RGFnTm9kZT4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDMxKTtcblxuLyoqXG4gKiBGdWxsIERBRyBzdGF0ZVxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkRhZ1N0YXRlXG4gKi9cbmV4cG9ydCB0eXBlIERhZ1N0YXRlID0gTWVzc2FnZTxcImxpZ2h0c3BlZWRkdWVsLndzLkRhZ1N0YXRlXCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiByZXBlYXRlZCBsaWdodHNwZWVkZHVlbC53cy5EYWdOb2RlIG5vZGVzID0gMTtcbiAgICovXG4gIG5vZGVzOiBEYWdOb2RlW107XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5EYWdTdGF0ZS5cbiAqIFVzZSBgY3JlYXRlKERhZ1N0YXRlU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBEYWdTdGF0ZVNjaGVtYTogR2VuTWVzc2FnZTxEYWdTdGF0ZT4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDMyKTtcblxuLyoqXG4gKiBDbGllbnQgXHUyMTkyIFNlcnZlcjogU3RhcnQgYSBEQUcgbm9kZVxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkRhZ1N0YXJ0XG4gKi9cbmV4cG9ydCB0eXBlIERhZ1N0YXJ0ID0gTWVzc2FnZTxcImxpZ2h0c3BlZWRkdWVsLndzLkRhZ1N0YXJ0XCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgbm9kZV9pZCA9IDE7XG4gICAqL1xuICBub2RlSWQ6IHN0cmluZztcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkRhZ1N0YXJ0LlxuICogVXNlIGBjcmVhdGUoRGFnU3RhcnRTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IERhZ1N0YXJ0U2NoZW1hOiBHZW5NZXNzYWdlPERhZ1N0YXJ0PiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMzMpO1xuXG4vKipcbiAqIENsaWVudCBcdTIxOTIgU2VydmVyOiBDYW5jZWwgYSBEQUcgbm9kZVxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkRhZ0NhbmNlbFxuICovXG5leHBvcnQgdHlwZSBEYWdDYW5jZWwgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuRGFnQ2FuY2VsXCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgbm9kZV9pZCA9IDE7XG4gICAqL1xuICBub2RlSWQ6IHN0cmluZztcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkRhZ0NhbmNlbC5cbiAqIFVzZSBgY3JlYXRlKERhZ0NhbmNlbFNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgRGFnQ2FuY2VsU2NoZW1hOiBHZW5NZXNzYWdlPERhZ0NhbmNlbD4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDM0KTtcblxuLyoqXG4gKiBDbGllbnQgXHUyMTkyIFNlcnZlcjogQWNrbm93bGVkZ2Ugc3RvcnkgZGlhbG9ndWVcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5EYWdTdG9yeUFja1xuICovXG5leHBvcnQgdHlwZSBEYWdTdG9yeUFjayA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5EYWdTdG9yeUFja1wiPiAmIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIG5vZGVfaWQgPSAxO1xuICAgKi9cbiAgbm9kZUlkOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEVtcHR5IGlmIGp1c3QgY29udGludWUgKG5vIGNob2ljZSlcbiAgICpcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgY2hvaWNlX2lkID0gMjtcbiAgICovXG4gIGNob2ljZUlkOiBzdHJpbmc7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5EYWdTdG9yeUFjay5cbiAqIFVzZSBgY3JlYXRlKERhZ1N0b3J5QWNrU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBEYWdTdG9yeUFja1NjaGVtYTogR2VuTWVzc2FnZTxEYWdTdG9yeUFjaz4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDM1KTtcblxuLyoqXG4gKiBDbGllbnQgXHUyMTkyIFNlcnZlcjogUmVxdWVzdCBmdWxsIERBRyBsaXN0XG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuRGFnTGlzdFxuICovXG5leHBvcnQgdHlwZSBEYWdMaXN0ID0gTWVzc2FnZTxcImxpZ2h0c3BlZWRkdWVsLndzLkRhZ0xpc3RcIj4gJiB7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5EYWdMaXN0LlxuICogVXNlIGBjcmVhdGUoRGFnTGlzdFNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgRGFnTGlzdFNjaGVtYTogR2VuTWVzc2FnZTxEYWdMaXN0PiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMzYpO1xuXG4vKipcbiAqIFNlcnZlciBcdTIxOTIgQ2xpZW50OiBEQUcgbGlzdCByZXNwb25zZVxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkRhZ0xpc3RSZXNwb25zZVxuICovXG5leHBvcnQgdHlwZSBEYWdMaXN0UmVzcG9uc2UgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuRGFnTGlzdFJlc3BvbnNlXCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5EYWdTdGF0ZSBkYWcgPSAxO1xuICAgKi9cbiAgZGFnPzogRGFnU3RhdGU7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5EYWdMaXN0UmVzcG9uc2UuXG4gKiBVc2UgYGNyZWF0ZShEYWdMaXN0UmVzcG9uc2VTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IERhZ0xpc3RSZXNwb25zZVNjaGVtYTogR2VuTWVzc2FnZTxEYWdMaXN0UmVzcG9uc2U+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCAzNyk7XG5cbi8qKlxuICogSW52ZW50b3J5IGl0ZW1cbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5JbnZlbnRvcnlJdGVtXG4gKi9cbmV4cG9ydCB0eXBlIEludmVudG9yeUl0ZW0gPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuSW52ZW50b3J5SXRlbVwiPiAmIHtcbiAgLyoqXG4gICAqIFwibWlzc2lsZVwiLCBcImNvbXBvbmVudFwiLCBldGMuXG4gICAqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIHR5cGUgPSAxO1xuICAgKi9cbiAgdHlwZTogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBTcGVjaWZpYyB2YXJpYW50IGlkZW50aWZpZXJcbiAgICpcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgdmFyaWFudF9pZCA9IDI7XG4gICAqL1xuICB2YXJpYW50SWQ6IHN0cmluZztcblxuICAvKipcbiAgICogSGVhdCBjYXBhY2l0eSBmb3IgdGhpcyBpdGVtXG4gICAqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIGhlYXRfY2FwYWNpdHkgPSAzO1xuICAgKi9cbiAgaGVhdENhcGFjaXR5OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIFN0YWNrIHF1YW50aXR5XG4gICAqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogaW50MzIgcXVhbnRpdHkgPSA0O1xuICAgKi9cbiAgcXVhbnRpdHk6IG51bWJlcjtcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkludmVudG9yeUl0ZW0uXG4gKiBVc2UgYGNyZWF0ZShJbnZlbnRvcnlJdGVtU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBJbnZlbnRvcnlJdGVtU2NoZW1hOiBHZW5NZXNzYWdlPEludmVudG9yeUl0ZW0+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCAzOCk7XG5cbi8qKlxuICogUGxheWVyIGludmVudG9yeVxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkludmVudG9yeVxuICovXG5leHBvcnQgdHlwZSBJbnZlbnRvcnkgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuSW52ZW50b3J5XCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiByZXBlYXRlZCBsaWdodHNwZWVkZHVlbC53cy5JbnZlbnRvcnlJdGVtIGl0ZW1zID0gMTtcbiAgICovXG4gIGl0ZW1zOiBJbnZlbnRvcnlJdGVtW107XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5JbnZlbnRvcnkuXG4gKiBVc2UgYGNyZWF0ZShJbnZlbnRvcnlTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEludmVudG9yeVNjaGVtYTogR2VuTWVzc2FnZTxJbnZlbnRvcnk+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCAzOSk7XG5cbi8qKlxuICogU3RvcnkgZGlhbG9ndWUgY2hvaWNlIG9wdGlvblxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLlN0b3J5RGlhbG9ndWVDaG9pY2VcbiAqL1xuZXhwb3J0IHR5cGUgU3RvcnlEaWFsb2d1ZUNob2ljZSA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5TdG9yeURpYWxvZ3VlQ2hvaWNlXCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgaWQgPSAxO1xuICAgKi9cbiAgaWQ6IHN0cmluZztcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgdGV4dCA9IDI7XG4gICAqL1xuICB0ZXh0OiBzdHJpbmc7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5TdG9yeURpYWxvZ3VlQ2hvaWNlLlxuICogVXNlIGBjcmVhdGUoU3RvcnlEaWFsb2d1ZUNob2ljZVNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgU3RvcnlEaWFsb2d1ZUNob2ljZVNjaGVtYTogR2VuTWVzc2FnZTxTdG9yeURpYWxvZ3VlQ2hvaWNlPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgNDApO1xuXG4vKipcbiAqIFN0b3J5IHR1dG9yaWFsIHRpcFxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLlN0b3J5VHV0b3JpYWxUaXBcbiAqL1xuZXhwb3J0IHR5cGUgU3RvcnlUdXRvcmlhbFRpcCA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5TdG9yeVR1dG9yaWFsVGlwXCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgdGl0bGUgPSAxO1xuICAgKi9cbiAgdGl0bGU6IHN0cmluZztcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgdGV4dCA9IDI7XG4gICAqL1xuICB0ZXh0OiBzdHJpbmc7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5TdG9yeVR1dG9yaWFsVGlwLlxuICogVXNlIGBjcmVhdGUoU3RvcnlUdXRvcmlhbFRpcFNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgU3RvcnlUdXRvcmlhbFRpcFNjaGVtYTogR2VuTWVzc2FnZTxTdG9yeVR1dG9yaWFsVGlwPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgNDEpO1xuXG4vKipcbiAqIFN0b3J5IGRpYWxvZ3VlIGNvbnRlbnRcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5TdG9yeURpYWxvZ3VlXG4gKi9cbmV4cG9ydCB0eXBlIFN0b3J5RGlhbG9ndWUgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuU3RvcnlEaWFsb2d1ZVwiPiAmIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIHNwZWFrZXIgPSAxO1xuICAgKi9cbiAgc3BlYWtlcjogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyB0ZXh0ID0gMjtcbiAgICovXG4gIHRleHQ6IHN0cmluZztcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5TdG9yeUludGVudCBpbnRlbnQgPSAzO1xuICAgKi9cbiAgaW50ZW50OiBTdG9yeUludGVudDtcblxuICAvKipcbiAgICogRW1wdHkgPSBkZWZhdWx0IFwiQ29udGludWVcIlxuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyBjb250aW51ZV9sYWJlbCA9IDQ7XG4gICAqL1xuICBjb250aW51ZUxhYmVsOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEVtcHR5ID0gc2hvdyBjb250aW51ZSBidXR0b25cbiAgICpcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiByZXBlYXRlZCBsaWdodHNwZWVkZHVlbC53cy5TdG9yeURpYWxvZ3VlQ2hvaWNlIGNob2ljZXMgPSA1O1xuICAgKi9cbiAgY2hvaWNlczogU3RvcnlEaWFsb2d1ZUNob2ljZVtdO1xuXG4gIC8qKlxuICAgKiBPcHRpb25hbCBnYW1lcGxheSBoaW50XG4gICAqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogb3B0aW9uYWwgbGlnaHRzcGVlZGR1ZWwud3MuU3RvcnlUdXRvcmlhbFRpcCB0dXRvcmlhbF90aXAgPSA2O1xuICAgKi9cbiAgdHV0b3JpYWxUaXA/OiBTdG9yeVR1dG9yaWFsVGlwO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuU3RvcnlEaWFsb2d1ZS5cbiAqIFVzZSBgY3JlYXRlKFN0b3J5RGlhbG9ndWVTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IFN0b3J5RGlhbG9ndWVTY2hlbWE6IEdlbk1lc3NhZ2U8U3RvcnlEaWFsb2d1ZT4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDQyKTtcblxuLyoqXG4gKiBTdG9yeSBldmVudCAoaGlzdG9yeSBlbnRyeSlcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5TdG9yeUV2ZW50XG4gKi9cbmV4cG9ydCB0eXBlIFN0b3J5RXZlbnQgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuU3RvcnlFdmVudFwiPiAmIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIGNoYXB0ZXJfaWQgPSAxO1xuICAgKi9cbiAgY2hhcHRlcklkOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIG5vZGVfaWQgPSAyO1xuICAgKi9cbiAgbm9kZUlkOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHRpbWVzdGFtcCA9IDM7XG4gICAqL1xuICB0aW1lc3RhbXA6IG51bWJlcjtcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLlN0b3J5RXZlbnQuXG4gKiBVc2UgYGNyZWF0ZShTdG9yeUV2ZW50U2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBTdG9yeUV2ZW50U2NoZW1hOiBHZW5NZXNzYWdlPFN0b3J5RXZlbnQ+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCA0Myk7XG5cbi8qKlxuICogU3Rvcnkgc3RhdGVcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5TdG9yeVN0YXRlXG4gKi9cbmV4cG9ydCB0eXBlIFN0b3J5U3RhdGUgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuU3RvcnlTdGF0ZVwiPiAmIHtcbiAgLyoqXG4gICAqIEN1cnJlbnRseSBhY3RpdmUgc3Rvcnkgbm9kZSBJRFxuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyBhY3RpdmVfbm9kZSA9IDE7XG4gICAqL1xuICBhY3RpdmVOb2RlOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEZ1bGwgZGlhbG9ndWUgY29udGVudFxuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IG9wdGlvbmFsIGxpZ2h0c3BlZWRkdWVsLndzLlN0b3J5RGlhbG9ndWUgZGlhbG9ndWUgPSAyO1xuICAgKi9cbiAgZGlhbG9ndWU/OiBTdG9yeURpYWxvZ3VlO1xuXG4gIC8qKlxuICAgKiBBdmFpbGFibGUgc3Rvcnkgbm9kZSBJRHNcbiAgICpcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiByZXBlYXRlZCBzdHJpbmcgYXZhaWxhYmxlID0gMztcbiAgICovXG4gIGF2YWlsYWJsZTogc3RyaW5nW107XG5cbiAgLyoqXG4gICAqIFN0b3J5IGZsYWdzIGZvciBicmFuY2hpbmdcbiAgICpcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBtYXA8c3RyaW5nLCBib29sPiBmbGFncyA9IDQ7XG4gICAqL1xuICBmbGFnczogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH07XG5cbiAgLyoqXG4gICAqIFJlY2VudCBzdG9yeSBldmVudHNcbiAgICpcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiByZXBlYXRlZCBsaWdodHNwZWVkZHVlbC53cy5TdG9yeUV2ZW50IHJlY2VudF9ldmVudHMgPSA1O1xuICAgKi9cbiAgcmVjZW50RXZlbnRzOiBTdG9yeUV2ZW50W107XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5TdG9yeVN0YXRlLlxuICogVXNlIGBjcmVhdGUoU3RvcnlTdGF0ZVNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgU3RvcnlTdGF0ZVNjaGVtYTogR2VuTWVzc2FnZTxTdG9yeVN0YXRlPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgNDQpO1xuXG4vKipcbiAqIENsaWVudCBcdTIxOTIgU2VydmVyOiBTcGF3biBtaXNzaW9uIHdhdmVcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5NaXNzaW9uU3Bhd25XYXZlXG4gKi9cbmV4cG9ydCB0eXBlIE1pc3Npb25TcGF3bldhdmUgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuTWlzc2lvblNwYXduV2F2ZVwiPiAmIHtcbiAgLyoqXG4gICAqIDEsIDIsIG9yIDNcbiAgICpcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBpbnQzMiB3YXZlX2luZGV4ID0gMTtcbiAgICovXG4gIHdhdmVJbmRleDogbnVtYmVyO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuTWlzc2lvblNwYXduV2F2ZS5cbiAqIFVzZSBgY3JlYXRlKE1pc3Npb25TcGF3bldhdmVTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IE1pc3Npb25TcGF3bldhdmVTY2hlbWE6IEdlbk1lc3NhZ2U8TWlzc2lvblNwYXduV2F2ZT4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDQ1KTtcblxuLyoqXG4gKiBDbGllbnQgXHUyMTkyIFNlcnZlcjogVHJpZ2dlciBtaXNzaW9uIHN0b3J5IGV2ZW50XG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuTWlzc2lvblN0b3J5RXZlbnRcbiAqL1xuZXhwb3J0IHR5cGUgTWlzc2lvblN0b3J5RXZlbnQgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuTWlzc2lvblN0b3J5RXZlbnRcIj4gJiB7XG4gIC8qKlxuICAgKiBlLmcuIFwibWlzc2lvbjpzdGFydFwiLCBcIm1pc3Npb246YmVhY29uLWxvY2tlZFwiXG4gICAqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIGV2ZW50ID0gMTtcbiAgICovXG4gIGV2ZW50OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEJlYWNvbiBpbmRleCBmb3IgYmVhY29uLXNwZWNpZmljIGV2ZW50c1xuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGludDMyIGJlYWNvbiA9IDI7XG4gICAqL1xuICBiZWFjb246IG51bWJlcjtcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLk1pc3Npb25TdG9yeUV2ZW50LlxuICogVXNlIGBjcmVhdGUoTWlzc2lvblN0b3J5RXZlbnRTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IE1pc3Npb25TdG9yeUV2ZW50U2NoZW1hOiBHZW5NZXNzYWdlPE1pc3Npb25TdG9yeUV2ZW50PiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgNDYpO1xuXG4vKipcbiAqIERBRyBub2RlIHN0YXR1cyBlbnVtXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIGVudW0gbGlnaHRzcGVlZGR1ZWwud3MuRGFnTm9kZVN0YXR1c1xuICovXG5leHBvcnQgZW51bSBEYWdOb2RlU3RhdHVzIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBEQUdfTk9ERV9TVEFUVVNfVU5TUEVDSUZJRUQgPSAwO1xuICAgKi9cbiAgVU5TUEVDSUZJRUQgPSAwLFxuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogREFHX05PREVfU1RBVFVTX0xPQ0tFRCA9IDE7XG4gICAqL1xuICBMT0NLRUQgPSAxLFxuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogREFHX05PREVfU1RBVFVTX0FWQUlMQUJMRSA9IDI7XG4gICAqL1xuICBBVkFJTEFCTEUgPSAyLFxuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogREFHX05PREVfU1RBVFVTX0lOX1BST0dSRVNTID0gMztcbiAgICovXG4gIElOX1BST0dSRVNTID0gMyxcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IERBR19OT0RFX1NUQVRVU19DT01QTEVURUQgPSA0O1xuICAgKi9cbiAgQ09NUExFVEVEID0gNCxcbn1cblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIGVudW0gbGlnaHRzcGVlZGR1ZWwud3MuRGFnTm9kZVN0YXR1cy5cbiAqL1xuZXhwb3J0IGNvbnN0IERhZ05vZGVTdGF0dXNTY2hlbWE6IEdlbkVudW08RGFnTm9kZVN0YXR1cz4gPSAvKkBfX1BVUkVfXyovXG4gIGVudW1EZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDApO1xuXG4vKipcbiAqIERBRyBub2RlIGtpbmQgZW51bVxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIGxpZ2h0c3BlZWRkdWVsLndzLkRhZ05vZGVLaW5kXG4gKi9cbmV4cG9ydCBlbnVtIERhZ05vZGVLaW5kIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBEQUdfTk9ERV9LSU5EX1VOU1BFQ0lGSUVEID0gMDtcbiAgICovXG4gIFVOU1BFQ0lGSUVEID0gMCxcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IERBR19OT0RFX0tJTkRfRkFDVE9SWSA9IDE7XG4gICAqL1xuICBGQUNUT1JZID0gMSxcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IERBR19OT0RFX0tJTkRfVU5JVCA9IDI7XG4gICAqL1xuICBVTklUID0gMixcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IERBR19OT0RFX0tJTkRfU1RPUlkgPSAzO1xuICAgKi9cbiAgU1RPUlkgPSAzLFxuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogREFHX05PREVfS0lORF9DUkFGVCA9IDQ7XG4gICAqL1xuICBDUkFGVCA9IDQsXG59XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBlbnVtIGxpZ2h0c3BlZWRkdWVsLndzLkRhZ05vZGVLaW5kLlxuICovXG5leHBvcnQgY29uc3QgRGFnTm9kZUtpbmRTY2hlbWE6IEdlbkVudW08RGFnTm9kZUtpbmQ+ID0gLypAX19QVVJFX18qL1xuICBlbnVtRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCAxKTtcblxuLyoqXG4gKiBVcGdyYWRlIGVmZmVjdCB0eXBlIGVudW1cbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gZW51bSBsaWdodHNwZWVkZHVlbC53cy5VcGdyYWRlRWZmZWN0VHlwZVxuICovXG5leHBvcnQgZW51bSBVcGdyYWRlRWZmZWN0VHlwZSB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVVBHUkFERV9FRkZFQ1RfVFlQRV9VTlNQRUNJRklFRCA9IDA7XG4gICAqL1xuICBVTlNQRUNJRklFRCA9IDAsXG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBVUEdSQURFX0VGRkVDVF9UWVBFX1NQRUVEX01VTFRJUExJRVIgPSAxO1xuICAgKi9cbiAgU1BFRURfTVVMVElQTElFUiA9IDEsXG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBVUEdSQURFX0VGRkVDVF9UWVBFX01JU1NJTEVfVU5MT0NLID0gMjtcbiAgICovXG4gIE1JU1NJTEVfVU5MT0NLID0gMixcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFVQR1JBREVfRUZGRUNUX1RZUEVfSEVBVF9DQVBBQ0lUWSA9IDM7XG4gICAqL1xuICBIRUFUX0NBUEFDSVRZID0gMyxcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFVQR1JBREVfRUZGRUNUX1RZUEVfSEVBVF9FRkZJQ0lFTkNZID0gNDtcbiAgICovXG4gIEhFQVRfRUZGSUNJRU5DWSA9IDQsXG59XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBlbnVtIGxpZ2h0c3BlZWRkdWVsLndzLlVwZ3JhZGVFZmZlY3RUeXBlLlxuICovXG5leHBvcnQgY29uc3QgVXBncmFkZUVmZmVjdFR5cGVTY2hlbWE6IEdlbkVudW08VXBncmFkZUVmZmVjdFR5cGU+ID0gLypAX19QVVJFX18qL1xuICBlbnVtRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCAyKTtcblxuLyoqXG4gKiBTdG9yeSBpbnRlbnQgZW51bVxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIGxpZ2h0c3BlZWRkdWVsLndzLlN0b3J5SW50ZW50XG4gKi9cbmV4cG9ydCBlbnVtIFN0b3J5SW50ZW50IHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBTVE9SWV9JTlRFTlRfVU5TUEVDSUZJRUQgPSAwO1xuICAgKi9cbiAgVU5TUEVDSUZJRUQgPSAwLFxuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogU1RPUllfSU5URU5UX0ZBQ1RPUlkgPSAxO1xuICAgKi9cbiAgRkFDVE9SWSA9IDEsXG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBTVE9SWV9JTlRFTlRfVU5JVCA9IDI7XG4gICAqL1xuICBVTklUID0gMixcbn1cblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIGVudW0gbGlnaHRzcGVlZGR1ZWwud3MuU3RvcnlJbnRlbnQuXG4gKi9cbmV4cG9ydCBjb25zdCBTdG9yeUludGVudFNjaGVtYTogR2VuRW51bTxTdG9yeUludGVudD4gPSAvKkBfX1BVUkVfXyovXG4gIGVudW1EZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDMpO1xuXG4iLCAiLy8gUHJvdG9idWYgY29udmVyc2lvbiBoZWxwZXJzXG5pbXBvcnQgdHlwZSB7XG4gIEdob3N0LFxuICBNaXNzaWxlLFxuICBTdGF0ZVVwZGF0ZSxcbiAgRGFnTm9kZSxcbiAgRGFnU3RhdGUsXG4gIEludmVudG9yeUl0ZW0sXG4gIEludmVudG9yeSxcbiAgU3RvcnlTdGF0ZSxcbiAgU3RvcnlEaWFsb2d1ZSxcbiAgU3RvcnlFdmVudCxcbiAgU3RvcnlEaWFsb2d1ZUNob2ljZSxcbiAgU3RvcnlUdXRvcmlhbFRpcCxcbiAgVXBncmFkZUVmZmVjdCxcbiAgUGxheWVyQ2FwYWJpbGl0aWVzLFxufSBmcm9tICcuL3Byb3RvL3Byb3RvL3dzX21lc3NhZ2VzX3BiJztcbi8vIEltcG9ydCBlbnVtcyBhcyB2YWx1ZXMsIG5vdCB0eXBlc1xuaW1wb3J0IHtcbiAgRGFnTm9kZVN0YXR1cyxcbiAgRGFnTm9kZUtpbmQsXG4gIFN0b3J5SW50ZW50LFxufSBmcm9tICcuL3Byb3RvL3Byb3RvL3dzX21lc3NhZ2VzX3BiJztcblxuLy8gQWRhcHRlciB0eXBlcyBmb3IgY29tcGF0aWJpbGl0eSB3aXRoIGV4aXN0aW5nIGNvZGVcbmV4cG9ydCBpbnRlcmZhY2UgR2hvc3RTbmFwc2hvdCB7XG4gIGlkOiBzdHJpbmc7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICB0OiBudW1iZXI7XG4gIHNlbGY6IGJvb2xlYW47XG4gIHdheXBvaW50cz86IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHNwZWVkOiBudW1iZXIgfVtdO1xuICBjdXJyZW50V2F5cG9pbnRJbmRleD86IG51bWJlcjtcbiAgaHA6IG51bWJlcjtcbiAga2lsbHM6IG51bWJlcjtcbiAgaGVhdD86IHtcbiAgICB2OiBudW1iZXI7XG4gICAgbTogbnVtYmVyO1xuICAgIHc6IG51bWJlcjtcbiAgICBvOiBudW1iZXI7XG4gICAgbXM6IG51bWJlcjtcbiAgICBzdTogbnVtYmVyO1xuICAgIGt1OiBudW1iZXI7XG4gICAga2Q6IG51bWJlcjtcbiAgICBleDogbnVtYmVyO1xuICB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVTbmFwc2hvdCB7XG4gIGlkOiBzdHJpbmc7XG4gIG93bmVyOiBzdHJpbmc7XG4gIHNlbGY6IGJvb2xlYW47XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICB0OiBudW1iZXI7XG4gIGFncm9SYWRpdXM6IG51bWJlcjtcbiAgbGlmZXRpbWU6IG51bWJlcjtcbiAgbGF1bmNoOiBudW1iZXI7XG4gIGV4cGlyZXM6IG51bWJlcjtcbiAgdGFyZ2V0SWQ/OiBzdHJpbmc7XG4gIGhlYXQ/OiB7XG4gICAgdjogbnVtYmVyO1xuICAgIG06IG51bWJlcjtcbiAgICB3OiBudW1iZXI7XG4gICAgbzogbnVtYmVyO1xuICAgIG1zOiBudW1iZXI7XG4gICAgc3U6IG51bWJlcjtcbiAgICBrdTogbnVtYmVyO1xuICAgIGtkOiBudW1iZXI7XG4gICAgZXg6IG51bWJlcjtcbiAgfTtcbn1cblxuLy8gQ29udmVydCBwcm90byBHaG9zdCB0byBHaG9zdFNuYXBzaG90XG5leHBvcnQgZnVuY3Rpb24gcHJvdG9Ub0dob3N0KHByb3RvOiBHaG9zdCk6IEdob3N0U25hcHNob3Qge1xuICByZXR1cm4ge1xuICAgIGlkOiBwcm90by5pZCxcbiAgICB4OiBwcm90by54LFxuICAgIHk6IHByb3RvLnksXG4gICAgdng6IHByb3RvLnZ4LFxuICAgIHZ5OiBwcm90by52eSxcbiAgICB0OiBwcm90by50LFxuICAgIHNlbGY6IHByb3RvLnNlbGYsXG4gICAgd2F5cG9pbnRzOiBwcm90by53YXlwb2ludHM/Lm1hcCh3cCA9PiAoeyB4OiB3cC54LCB5OiB3cC55LCBzcGVlZDogd3Auc3BlZWQgfSkpLFxuICAgIGN1cnJlbnRXYXlwb2ludEluZGV4OiBwcm90by5jdXJyZW50V2F5cG9pbnRJbmRleCxcbiAgICBocDogcHJvdG8uaHAsXG4gICAga2lsbHM6IHByb3RvLmtpbGxzLFxuICAgIGhlYXQ6IHByb3RvLmhlYXQgPyB7XG4gICAgICB2OiBwcm90by5oZWF0LnYsXG4gICAgICBtOiBwcm90by5oZWF0Lm0sXG4gICAgICB3OiBwcm90by5oZWF0LncsXG4gICAgICBvOiBwcm90by5oZWF0Lm8sXG4gICAgICBtczogcHJvdG8uaGVhdC5tcyxcbiAgICAgIHN1OiBwcm90by5oZWF0LnN1LFxuICAgICAga3U6IHByb3RvLmhlYXQua3UsXG4gICAgICBrZDogcHJvdG8uaGVhdC5rZCxcbiAgICAgIGV4OiBwcm90by5oZWF0LmV4LFxuICAgIH0gOiB1bmRlZmluZWQsXG4gIH07XG59XG5cbi8vIENvbnZlcnQgcHJvdG8gTWlzc2lsZSB0byBNaXNzaWxlU25hcHNob3RcbmV4cG9ydCBmdW5jdGlvbiBwcm90b1RvTWlzc2lsZShwcm90bzogTWlzc2lsZSk6IE1pc3NpbGVTbmFwc2hvdCB7XG4gIHJldHVybiB7XG4gICAgaWQ6IHByb3RvLmlkLFxuICAgIG93bmVyOiBwcm90by5vd25lcixcbiAgICBzZWxmOiBwcm90by5zZWxmLFxuICAgIHg6IHByb3RvLngsXG4gICAgeTogcHJvdG8ueSxcbiAgICB2eDogcHJvdG8udngsXG4gICAgdnk6IHByb3RvLnZ5LFxuICAgIHQ6IHByb3RvLnQsXG4gICAgYWdyb1JhZGl1czogcHJvdG8uYWdyb1JhZGl1cyxcbiAgICBsaWZldGltZTogcHJvdG8ubGlmZXRpbWUsXG4gICAgbGF1bmNoOiBwcm90by5sYXVuY2hUaW1lLFxuICAgIGV4cGlyZXM6IHByb3RvLmV4cGlyZXNBdCxcbiAgICB0YXJnZXRJZDogcHJvdG8udGFyZ2V0SWQgfHwgdW5kZWZpbmVkLFxuICAgIGhlYXQ6IHByb3RvLmhlYXQgPyB7XG4gICAgICB2OiBwcm90by5oZWF0LnYsXG4gICAgICBtOiBwcm90by5oZWF0Lm0sXG4gICAgICB3OiBwcm90by5oZWF0LncsXG4gICAgICBvOiBwcm90by5oZWF0Lm8sXG4gICAgICBtczogcHJvdG8uaGVhdC5tcyxcbiAgICAgIHN1OiBwcm90by5oZWF0LnN1LFxuICAgICAga3U6IHByb3RvLmhlYXQua3UsXG4gICAgICBrZDogcHJvdG8uaGVhdC5rZCxcbiAgICAgIGV4OiBwcm90by5oZWF0LmV4LFxuICAgIH0gOiB1bmRlZmluZWQsXG4gIH07XG59XG5cbi8vIENvbnZlcnQgcHJvdG8gU3RhdGVVcGRhdGUgdG8gQXBwU3RhdGUgZm9ybWF0XG5leHBvcnQgZnVuY3Rpb24gcHJvdG9Ub1N0YXRlKHByb3RvOiBTdGF0ZVVwZGF0ZSkge1xuICBjb25zdCBiYXNlID0ge1xuICAgIG5vdzogcHJvdG8ubm93LFxuICAgIG1lOiBwcm90by5tZSA/IHByb3RvVG9HaG9zdChwcm90by5tZSkgOiBudWxsLFxuICAgIGdob3N0czogcHJvdG8uZ2hvc3RzLm1hcChwcm90b1RvR2hvc3QpLFxuICAgIG1pc3NpbGVzOiBwcm90by5taXNzaWxlcy5tYXAocHJvdG9Ub01pc3NpbGUpLFxuICAgIG1ldGE6IHByb3RvLm1ldGEgPyB7XG4gICAgICBjOiBwcm90by5tZXRhLmMsXG4gICAgICB3OiBwcm90by5tZXRhLncsXG4gICAgICBoOiBwcm90by5tZXRhLmgsXG4gICAgfSA6IHsgYzogMjk5LCB3OiAxNjAwMCwgaDogOTAwMCB9LFxuICAgIG1pc3NpbGVDb25maWc6IHByb3RvLm1pc3NpbGVDb25maWcgPyB7XG4gICAgICBzcGVlZDogcHJvdG8ubWlzc2lsZUNvbmZpZy5zcGVlZCxcbiAgICAgIHNwZWVkTWluOiBwcm90by5taXNzaWxlQ29uZmlnLnNwZWVkTWluLFxuICAgICAgc3BlZWRNYXg6IHByb3RvLm1pc3NpbGVDb25maWcuc3BlZWRNYXgsXG4gICAgICBhZ3JvTWluOiBwcm90by5taXNzaWxlQ29uZmlnLmFncm9NaW4sXG4gICAgICBhZ3JvUmFkaXVzOiBwcm90by5taXNzaWxlQ29uZmlnLmFncm9SYWRpdXMsXG4gICAgICBsaWZldGltZTogcHJvdG8ubWlzc2lsZUNvbmZpZy5saWZldGltZSxcbiAgICAgIGhlYXRDb25maWc6IHByb3RvLm1pc3NpbGVDb25maWcuaGVhdENvbmZpZyA/IHtcbiAgICAgICAgbWF4OiBwcm90by5taXNzaWxlQ29uZmlnLmhlYXRDb25maWcubWF4LFxuICAgICAgICB3YXJuQXQ6IHByb3RvLm1pc3NpbGVDb25maWcuaGVhdENvbmZpZy53YXJuQXQsXG4gICAgICAgIG92ZXJoZWF0QXQ6IHByb3RvLm1pc3NpbGVDb25maWcuaGVhdENvbmZpZy5vdmVyaGVhdEF0LFxuICAgICAgICBtYXJrZXJTcGVlZDogcHJvdG8ubWlzc2lsZUNvbmZpZy5oZWF0Q29uZmlnLm1hcmtlclNwZWVkLFxuICAgICAgICBrVXA6IHByb3RvLm1pc3NpbGVDb25maWcuaGVhdENvbmZpZy5rVXAsXG4gICAgICAgIGtEb3duOiBwcm90by5taXNzaWxlQ29uZmlnLmhlYXRDb25maWcua0Rvd24sXG4gICAgICAgIGV4cDogcHJvdG8ubWlzc2lsZUNvbmZpZy5oZWF0Q29uZmlnLmV4cCxcbiAgICAgIH0gOiB1bmRlZmluZWQsXG4gICAgfSA6IHtcbiAgICAgIHNwZWVkOiAwLFxuICAgICAgc3BlZWRNaW46IDAsXG4gICAgICBzcGVlZE1heDogMCxcbiAgICAgIGFncm9NaW46IDAsXG4gICAgICBhZ3JvUmFkaXVzOiAwLFxuICAgICAgbGlmZXRpbWU6IDAsXG4gICAgfSxcbiAgICBtaXNzaWxlV2F5cG9pbnRzOiBwcm90by5taXNzaWxlV2F5cG9pbnRzLm1hcCh3cCA9PiAoeyB4OiB3cC54LCB5OiB3cC55LCBzcGVlZDogd3Auc3BlZWQgfSkpLFxuICAgIG1pc3NpbGVSb3V0ZXM6IHByb3RvLm1pc3NpbGVSb3V0ZXMubWFwKHIgPT4gKHtcbiAgICAgIGlkOiByLmlkLFxuICAgICAgbmFtZTogci5uYW1lLFxuICAgICAgd2F5cG9pbnRzOiByLndheXBvaW50cy5tYXAod3AgPT4gKHsgeDogd3AueCwgeTogd3AueSwgc3BlZWQ6IHdwLnNwZWVkIH0pKSxcbiAgICB9KSksXG4gICAgYWN0aXZlTWlzc2lsZVJvdXRlOiBwcm90by5hY3RpdmVNaXNzaWxlUm91dGUsXG4gICAgbmV4dE1pc3NpbGVSZWFkeTogcHJvdG8ubmV4dE1pc3NpbGVSZWFkeSxcbiAgfTtcblxuICAvLyBQaGFzZSAyIGFkZGl0aW9uc1xuICByZXR1cm4ge1xuICAgIC4uLmJhc2UsXG4gICAgZGFnOiBwcm90by5kYWcgPyBwcm90b1RvRGFnU3RhdGUocHJvdG8uZGFnKSA6IHVuZGVmaW5lZCxcbiAgICBpbnZlbnRvcnk6IHByb3RvLmludmVudG9yeSA/IHByb3RvVG9JbnZlbnRvcnkocHJvdG8uaW52ZW50b3J5KSA6IHVuZGVmaW5lZCxcbiAgICBzdG9yeTogcHJvdG8uc3RvcnkgPyBwcm90b1RvU3RvcnlTdGF0ZShwcm90by5zdG9yeSkgOiB1bmRlZmluZWQsXG4gICAgY2FwYWJpbGl0aWVzOiBwcm90by5jYXBhYmlsaXRpZXMgPyBwcm90b1RvUGxheWVyQ2FwYWJpbGl0aWVzKHByb3RvLmNhcGFiaWxpdGllcykgOiB1bmRlZmluZWQsXG4gIH07XG59XG5cbi8vID09PT09PT09PT0gUGhhc2UgMjogRW51bSBDb252ZXJ0ZXJzID09PT09PT09PT1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb3RvU3RhdHVzVG9TdHJpbmcoc3RhdHVzOiBEYWdOb2RlU3RhdHVzKTogc3RyaW5nIHtcbiAgc3dpdGNoIChzdGF0dXMpIHtcbiAgICBjYXNlIERhZ05vZGVTdGF0dXMuTE9DS0VEOiByZXR1cm4gJ2xvY2tlZCc7XG4gICAgY2FzZSBEYWdOb2RlU3RhdHVzLkFWQUlMQUJMRTogcmV0dXJuICdhdmFpbGFibGUnO1xuICAgIGNhc2UgRGFnTm9kZVN0YXR1cy5JTl9QUk9HUkVTUzogcmV0dXJuICdpbl9wcm9ncmVzcyc7XG4gICAgY2FzZSBEYWdOb2RlU3RhdHVzLkNPTVBMRVRFRDogcmV0dXJuICdjb21wbGV0ZWQnO1xuICAgIGRlZmF1bHQ6IHJldHVybiAndW5rbm93bic7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb3RvS2luZFRvU3RyaW5nKGtpbmQ6IERhZ05vZGVLaW5kKTogc3RyaW5nIHtcbiAgc3dpdGNoIChraW5kKSB7XG4gICAgY2FzZSBEYWdOb2RlS2luZC5GQUNUT1JZOiByZXR1cm4gJ2ZhY3RvcnknO1xuICAgIGNhc2UgRGFnTm9kZUtpbmQuVU5JVDogcmV0dXJuICd1bml0JztcbiAgICBjYXNlIERhZ05vZGVLaW5kLlNUT1JZOiByZXR1cm4gJ3N0b3J5JztcbiAgICBjYXNlIERhZ05vZGVLaW5kLkNSQUZUOiByZXR1cm4gJ2NyYWZ0JztcbiAgICBkZWZhdWx0OiByZXR1cm4gJ3Vua25vd24nO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm90b0ludGVudFRvU3RyaW5nKGludGVudDogU3RvcnlJbnRlbnQpOiBzdHJpbmcge1xuICBzd2l0Y2ggKGludGVudCkge1xuICAgIGNhc2UgU3RvcnlJbnRlbnQuRkFDVE9SWTogcmV0dXJuICdmYWN0b3J5JztcbiAgICBjYXNlIFN0b3J5SW50ZW50LlVOSVQ6IHJldHVybiAndW5pdCc7XG4gICAgZGVmYXVsdDogcmV0dXJuICcnO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm90b0VmZmVjdFR5cGVUb1N0cmluZyh0eXBlOiBhbnkpOiBzdHJpbmcge1xuICAvLyBNYXAgcHJvdG8gZW51bSB2YWx1ZXMgdG8gc3RyaW5nc1xuICAvLyBUT0RPOiBVc2UgcHJvcGVyIGVudW0gd2hlbiBwcm90byBpcyByZWdlbmVyYXRlZFxuICBjb25zdCB0eXBlTWFwOiBSZWNvcmQ8bnVtYmVyLCBzdHJpbmc+ID0ge1xuICAgIDE6ICdzcGVlZF9tdWx0aXBsaWVyJyxcbiAgICAyOiAnbWlzc2lsZV91bmxvY2snLFxuICAgIDM6ICdoZWF0X2NhcGFjaXR5JyxcbiAgICA0OiAnaGVhdF9lZmZpY2llbmN5JyxcbiAgfTtcbiAgcmV0dXJuIHR5cGVNYXBbdHlwZV0gfHwgJ3Vua25vd24nO1xufVxuXG4vLyA9PT09PT09PT09IFBoYXNlIDI6IFR5cGUgRGVmaW5pdGlvbnMgPT09PT09PT09PVxuXG5leHBvcnQgaW50ZXJmYWNlIFVwZ3JhZGVFZmZlY3REYXRhIHtcbiAgdHlwZTogc3RyaW5nO1xuICB2YWx1ZTogbnVtYmVyIHwgc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIERhZ05vZGVEYXRhIHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogc3RyaW5nO1xuICBsYWJlbDogc3RyaW5nO1xuICBzdGF0dXM6IHN0cmluZztcbiAgcmVtYWluaW5nUzogbnVtYmVyO1xuICBkdXJhdGlvblM6IG51bWJlcjtcbiAgcmVwZWF0YWJsZTogYm9vbGVhbjtcbiAgZWZmZWN0cz86IFVwZ3JhZGVFZmZlY3REYXRhW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGxheWVyQ2FwYWJpbGl0aWVzRGF0YSB7XG4gIHNwZWVkTXVsdGlwbGllcjogbnVtYmVyO1xuICB1bmxvY2tlZE1pc3NpbGVzOiBzdHJpbmdbXTtcbiAgaGVhdENhcGFjaXR5OiBudW1iZXI7XG4gIGhlYXRFZmZpY2llbmN5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGFnU3RhdGVEYXRhIHtcbiAgbm9kZXM6IERhZ05vZGVEYXRhW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW52ZW50b3J5SXRlbURhdGEge1xuICB0eXBlOiBzdHJpbmc7XG4gIHZhcmlhbnRJZDogc3RyaW5nO1xuICBoZWF0Q2FwYWNpdHk6IG51bWJlcjtcbiAgcXVhbnRpdHk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJbnZlbnRvcnlEYXRhIHtcbiAgaXRlbXM6IEludmVudG9yeUl0ZW1EYXRhW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcnlEaWFsb2d1ZUNob2ljZURhdGEge1xuICBpZDogc3RyaW5nO1xuICB0ZXh0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcnlUdXRvcmlhbFRpcERhdGEge1xuICB0aXRsZTogc3RyaW5nO1xuICB0ZXh0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcnlEaWFsb2d1ZURhdGEge1xuICBzcGVha2VyOiBzdHJpbmc7XG4gIHRleHQ6IHN0cmluZztcbiAgaW50ZW50OiBzdHJpbmc7XG4gIGNvbnRpbnVlTGFiZWw6IHN0cmluZztcbiAgY2hvaWNlczogU3RvcnlEaWFsb2d1ZUNob2ljZURhdGFbXTtcbiAgdHV0b3JpYWxUaXA/OiBTdG9yeVR1dG9yaWFsVGlwRGF0YTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdG9yeUV2ZW50RGF0YSB7XG4gIGNoYXB0ZXJJZDogc3RyaW5nO1xuICBub2RlSWQ6IHN0cmluZztcbiAgdGltZXN0YW1wOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcnlTdGF0ZURhdGEge1xuICBhY3RpdmVOb2RlOiBzdHJpbmc7XG4gIGRpYWxvZ3VlPzogU3RvcnlEaWFsb2d1ZURhdGE7XG4gIGF2YWlsYWJsZTogc3RyaW5nW107XG4gIGZsYWdzOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPjtcbiAgcmVjZW50RXZlbnRzOiBTdG9yeUV2ZW50RGF0YVtdO1xufVxuXG4vLyA9PT09PT09PT09IFBoYXNlIDI6IENvbnZlcnNpb24gRnVuY3Rpb25zID09PT09PT09PT1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb3RvVG9VcGdyYWRlRWZmZWN0KHByb3RvOiBVcGdyYWRlRWZmZWN0KTogVXBncmFkZUVmZmVjdERhdGEge1xuICByZXR1cm4ge1xuICAgIHR5cGU6IHByb3RvRWZmZWN0VHlwZVRvU3RyaW5nKHByb3RvLnR5cGUpLFxuICAgIHZhbHVlOiBwcm90by52YWx1ZS5jYXNlID09PSAnbXVsdGlwbGllcicgPyBwcm90by52YWx1ZS52YWx1ZSA6IHByb3RvLnZhbHVlLnZhbHVlLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvdG9Ub1BsYXllckNhcGFiaWxpdGllcyhwcm90bzogUGxheWVyQ2FwYWJpbGl0aWVzKTogUGxheWVyQ2FwYWJpbGl0aWVzRGF0YSB7XG4gIHJldHVybiB7XG4gICAgc3BlZWRNdWx0aXBsaWVyOiBwcm90by5zcGVlZE11bHRpcGxpZXIsXG4gICAgdW5sb2NrZWRNaXNzaWxlczogcHJvdG8udW5sb2NrZWRNaXNzaWxlcyxcbiAgICBoZWF0Q2FwYWNpdHk6IHByb3RvLmhlYXRDYXBhY2l0eSxcbiAgICBoZWF0RWZmaWNpZW5jeTogcHJvdG8uaGVhdEVmZmljaWVuY3ksXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm90b1RvRGFnTm9kZShwcm90bzogRGFnTm9kZSk6IERhZ05vZGVEYXRhIHtcbiAgcmV0dXJuIHtcbiAgICBpZDogcHJvdG8uaWQsXG4gICAga2luZDogcHJvdG9LaW5kVG9TdHJpbmcocHJvdG8ua2luZCksXG4gICAgbGFiZWw6IHByb3RvLmxhYmVsLFxuICAgIHN0YXR1czogcHJvdG9TdGF0dXNUb1N0cmluZyhwcm90by5zdGF0dXMpLFxuICAgIHJlbWFpbmluZ1M6IHByb3RvLnJlbWFpbmluZ1MsXG4gICAgZHVyYXRpb25TOiBwcm90by5kdXJhdGlvblMsXG4gICAgcmVwZWF0YWJsZTogcHJvdG8ucmVwZWF0YWJsZSxcbiAgICBlZmZlY3RzOiBwcm90by5lZmZlY3RzPy5tYXAocHJvdG9Ub1VwZ3JhZGVFZmZlY3QpIHx8IFtdLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvdG9Ub0RhZ1N0YXRlKHByb3RvOiBEYWdTdGF0ZSk6IERhZ1N0YXRlRGF0YSB7XG4gIHJldHVybiB7XG4gICAgbm9kZXM6IHByb3RvLm5vZGVzLm1hcChwcm90b1RvRGFnTm9kZSksXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm90b1RvSW52ZW50b3J5SXRlbShwcm90bzogSW52ZW50b3J5SXRlbSk6IEludmVudG9yeUl0ZW1EYXRhIHtcbiAgcmV0dXJuIHtcbiAgICB0eXBlOiBwcm90by50eXBlLFxuICAgIHZhcmlhbnRJZDogcHJvdG8udmFyaWFudElkLFxuICAgIGhlYXRDYXBhY2l0eTogcHJvdG8uaGVhdENhcGFjaXR5LFxuICAgIHF1YW50aXR5OiBwcm90by5xdWFudGl0eSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb3RvVG9JbnZlbnRvcnkocHJvdG86IEludmVudG9yeSk6IEludmVudG9yeURhdGEge1xuICByZXR1cm4ge1xuICAgIGl0ZW1zOiBwcm90by5pdGVtcy5tYXAocHJvdG9Ub0ludmVudG9yeUl0ZW0pLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvdG9Ub1N0b3J5RGlhbG9ndWUocHJvdG86IFN0b3J5RGlhbG9ndWUpOiBTdG9yeURpYWxvZ3VlRGF0YSB7XG4gIHJldHVybiB7XG4gICAgc3BlYWtlcjogcHJvdG8uc3BlYWtlcixcbiAgICB0ZXh0OiBwcm90by50ZXh0LFxuICAgIGludGVudDogcHJvdG9JbnRlbnRUb1N0cmluZyhwcm90by5pbnRlbnQpLFxuICAgIGNvbnRpbnVlTGFiZWw6IHByb3RvLmNvbnRpbnVlTGFiZWwsXG4gICAgY2hvaWNlczogcHJvdG8uY2hvaWNlcy5tYXAoYyA9PiAoeyBpZDogYy5pZCwgdGV4dDogYy50ZXh0IH0pKSxcbiAgICB0dXRvcmlhbFRpcDogcHJvdG8udHV0b3JpYWxUaXAgPyB7XG4gICAgICB0aXRsZTogcHJvdG8udHV0b3JpYWxUaXAudGl0bGUsXG4gICAgICB0ZXh0OiBwcm90by50dXRvcmlhbFRpcC50ZXh0LFxuICAgIH0gOiB1bmRlZmluZWQsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm90b1RvU3RvcnlTdGF0ZShwcm90bzogU3RvcnlTdGF0ZSk6IFN0b3J5U3RhdGVEYXRhIHtcbiAgcmV0dXJuIHtcbiAgICBhY3RpdmVOb2RlOiBwcm90by5hY3RpdmVOb2RlLFxuICAgIGRpYWxvZ3VlOiBwcm90by5kaWFsb2d1ZSA/IHByb3RvVG9TdG9yeURpYWxvZ3VlKHByb3RvLmRpYWxvZ3VlKSA6IHVuZGVmaW5lZCxcbiAgICBhdmFpbGFibGU6IHByb3RvLmF2YWlsYWJsZSxcbiAgICBmbGFnczogcHJvdG8uZmxhZ3MsXG4gICAgcmVjZW50RXZlbnRzOiBwcm90by5yZWNlbnRFdmVudHMubWFwKGUgPT4gKHtcbiAgICAgIGNoYXB0ZXJJZDogZS5jaGFwdGVySWQsXG4gICAgICBub2RlSWQ6IGUubm9kZUlkLFxuICAgICAgdGltZXN0YW1wOiBlLnRpbWVzdGFtcCxcbiAgICB9KSksXG4gIH07XG59XG4iLCAiaW1wb3J0IHsgdHlwZSBFdmVudEJ1cyB9IGZyb20gXCIuL2J1c1wiO1xuaW1wb3J0IHtcbiAgdHlwZSBBcHBTdGF0ZSxcbiAgdHlwZSBNaXNzaWxlUm91dGUsXG4gIG1vbm90b25pY05vdyxcbiAgc2FuaXRpemVNaXNzaWxlQ29uZmlnLFxuICB1cGRhdGVNaXNzaWxlTGltaXRzLFxufSBmcm9tIFwiLi9zdGF0ZVwiO1xuaW1wb3J0IHR5cGUgeyBEaWFsb2d1ZUNvbnRlbnQgfSBmcm9tIFwiLi9zdG9yeS90eXBlc1wiO1xuaW1wb3J0IHsgY3JlYXRlLCB0b0JpbmFyeSwgZnJvbUJpbmFyeSB9IGZyb20gXCJAYnVmYnVpbGQvcHJvdG9idWZcIjtcbmltcG9ydCB7IFdzRW52ZWxvcGVTY2hlbWEsIHR5cGUgV3NFbnZlbG9wZSB9IGZyb20gXCIuL3Byb3RvL3Byb3RvL3dzX21lc3NhZ2VzX3BiXCI7XG5pbXBvcnQgeyBwcm90b1RvU3RhdGUsIHByb3RvVG9EYWdTdGF0ZSB9IGZyb20gXCIuL3Byb3RvX2hlbHBlcnNcIjtcblxuaW50ZXJmYWNlIENvbm5lY3RPcHRpb25zIHtcbiAgcm9vbTogc3RyaW5nO1xuICBzdGF0ZTogQXBwU3RhdGU7XG4gIGJ1czogRXZlbnRCdXM7XG4gIG9uU3RhdGVVcGRhdGVkPzogKCkgPT4gdm9pZDtcbiAgb25PcGVuPzogKHNvY2tldDogV2ViU29ja2V0KSA9PiB2b2lkO1xuICBtYXBXPzogbnVtYmVyO1xuICBtYXBIPzogbnVtYmVyO1xuICBtb2RlPzogc3RyaW5nO1xuICBtaXNzaW9uSWQ/OiBzdHJpbmc7XG59XG5cbmxldCB3czogV2ViU29ja2V0IHwgbnVsbCA9IG51bGw7XG5cbi8vIEhlbHBlciB0byBzZW5kIHByb3RvYnVmIG1lc3NhZ2VzXG5mdW5jdGlvbiBzZW5kUHJvdG8oZW52ZWxvcGU6IFdzRW52ZWxvcGUpIHtcbiAgaWYgKCF3cyB8fCB3cy5yZWFkeVN0YXRlICE9PSBXZWJTb2NrZXQuT1BFTikgcmV0dXJuO1xuICBjb25zdCBieXRlcyA9IHRvQmluYXJ5KFdzRW52ZWxvcGVTY2hlbWEsIGVudmVsb3BlKTtcbiAgd3Muc2VuZChieXRlcyk7XG59XG5cbi8vIExlZ2FjeSBKU09OIG1lc3NhZ2Ugc2VuZGVyIChrZXB0IGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5IGFuZCBEQUcgbWVzc2FnZXMpXG5leHBvcnQgZnVuY3Rpb24gc2VuZE1lc3NhZ2UocGF5bG9hZDogdW5rbm93bik6IHZvaWQge1xuICBpZiAoIXdzIHx8IHdzLnJlYWR5U3RhdGUgIT09IFdlYlNvY2tldC5PUEVOKSByZXR1cm47XG5cbiAgLy8gSWYgcGF5bG9hZCBoYXMgYSBcInR5cGVcIiBmaWVsZCwgY29udmVydCB0byBwcm90b2J1ZlxuICBpZiAodHlwZW9mIHBheWxvYWQgPT09IFwib2JqZWN0XCIgJiYgcGF5bG9hZCAhPT0gbnVsbCAmJiBcInR5cGVcIiBpbiBwYXlsb2FkKSB7XG4gICAgY29uc3QgbXNnID0gcGF5bG9hZCBhcyBhbnk7XG5cbiAgICAvLyBDb252ZXJ0IGNvbW1vbiBtZXNzYWdlIHR5cGVzIHRvIHByb3RvYnVmXG4gICAgc3dpdGNoIChtc2cudHlwZSkge1xuICAgICAgY2FzZSBcImpvaW5cIjpcbiAgICAgICAgc2VuZFByb3RvKGNyZWF0ZShXc0VudmVsb3BlU2NoZW1hLCB7XG4gICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgY2FzZTogXCJqb2luXCIsXG4gICAgICAgICAgICB2YWx1ZToge1xuICAgICAgICAgICAgICBuYW1lOiBtc2cubmFtZSB8fCBcIlwiLFxuICAgICAgICAgICAgICByb29tOiBtc2cucm9vbSB8fCBcIlwiLFxuICAgICAgICAgICAgICBtYXBXOiBtc2cubWFwX3cgfHwgMCxcbiAgICAgICAgICAgICAgbWFwSDogbXNnLm1hcF9oIHx8IDAsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pKTtcbiAgICAgICAgcmV0dXJuO1xuXG4gICAgICBjYXNlIFwic3Bhd25fYm90XCI6XG4gICAgICAgIHNlbmRQcm90byhjcmVhdGUoV3NFbnZlbG9wZVNjaGVtYSwge1xuICAgICAgICAgIHBheWxvYWQ6IHsgY2FzZTogXCJzcGF3bkJvdFwiLCB2YWx1ZToge30gfSxcbiAgICAgICAgfSkpO1xuICAgICAgICByZXR1cm47XG5cbiAgICAgIGNhc2UgXCJhZGRfd2F5cG9pbnRcIjpcbiAgICAgICAgc2VuZFByb3RvKGNyZWF0ZShXc0VudmVsb3BlU2NoZW1hLCB7XG4gICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgY2FzZTogXCJhZGRXYXlwb2ludFwiLFxuICAgICAgICAgICAgdmFsdWU6IHsgeDogbXNnLngsIHk6IG1zZy55LCBzcGVlZDogbXNnLnNwZWVkIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSkpO1xuICAgICAgICByZXR1cm47XG5cbiAgICAgIGNhc2UgXCJ1cGRhdGVfd2F5cG9pbnRcIjpcbiAgICAgICAgc2VuZFByb3RvKGNyZWF0ZShXc0VudmVsb3BlU2NoZW1hLCB7XG4gICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgY2FzZTogXCJ1cGRhdGVXYXlwb2ludFwiLFxuICAgICAgICAgICAgdmFsdWU6IHsgaW5kZXg6IG1zZy5pbmRleCwgc3BlZWQ6IG1zZy5zcGVlZCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pKTtcbiAgICAgICAgcmV0dXJuO1xuXG4gICAgICBjYXNlIFwibW92ZV93YXlwb2ludFwiOlxuICAgICAgICBzZW5kUHJvdG8oY3JlYXRlKFdzRW52ZWxvcGVTY2hlbWEsIHtcbiAgICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgICBjYXNlOiBcIm1vdmVXYXlwb2ludFwiLFxuICAgICAgICAgICAgdmFsdWU6IHsgaW5kZXg6IG1zZy5pbmRleCwgeDogbXNnLngsIHk6IG1zZy55IH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSkpO1xuICAgICAgICByZXR1cm47XG5cbiAgICAgIGNhc2UgXCJkZWxldGVfd2F5cG9pbnRcIjpcbiAgICAgICAgc2VuZFByb3RvKGNyZWF0ZShXc0VudmVsb3BlU2NoZW1hLCB7XG4gICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgY2FzZTogXCJkZWxldGVXYXlwb2ludFwiLFxuICAgICAgICAgICAgdmFsdWU6IHsgaW5kZXg6IG1zZy5pbmRleCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pKTtcbiAgICAgICAgcmV0dXJuO1xuXG4gICAgICBjYXNlIFwiY2xlYXJfd2F5cG9pbnRzXCI6XG4gICAgICAgIHNlbmRQcm90byhjcmVhdGUoV3NFbnZlbG9wZVNjaGVtYSwge1xuICAgICAgICAgIHBheWxvYWQ6IHsgY2FzZTogXCJjbGVhcldheXBvaW50c1wiLCB2YWx1ZToge30gfSxcbiAgICAgICAgfSkpO1xuICAgICAgICByZXR1cm47XG5cbiAgICAgIGNhc2UgXCJjb25maWd1cmVfbWlzc2lsZVwiOlxuICAgICAgICBzZW5kUHJvdG8oY3JlYXRlKFdzRW52ZWxvcGVTY2hlbWEsIHtcbiAgICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgICBjYXNlOiBcImNvbmZpZ3VyZU1pc3NpbGVcIixcbiAgICAgICAgICAgIHZhbHVlOiB7IG1pc3NpbGVTcGVlZDogbXNnLm1pc3NpbGVfc3BlZWQsIG1pc3NpbGVBZ3JvOiBtc2cubWlzc2lsZV9hZ3JvIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSkpO1xuICAgICAgICByZXR1cm47XG5cbiAgICAgIGNhc2UgXCJsYXVuY2hfbWlzc2lsZVwiOlxuICAgICAgICBzZW5kUHJvdG8oY3JlYXRlKFdzRW52ZWxvcGVTY2hlbWEsIHtcbiAgICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgICBjYXNlOiBcImxhdW5jaE1pc3NpbGVcIixcbiAgICAgICAgICAgIHZhbHVlOiB7IHJvdXRlSWQ6IG1zZy5yb3V0ZV9pZCB8fCBcIlwiIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSkpO1xuICAgICAgICByZXR1cm47XG5cbiAgICAgIGNhc2UgXCJhZGRfbWlzc2lsZV93YXlwb2ludFwiOlxuICAgICAgICBzZW5kUHJvdG8oY3JlYXRlKFdzRW52ZWxvcGVTY2hlbWEsIHtcbiAgICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgICBjYXNlOiBcImFkZE1pc3NpbGVXYXlwb2ludFwiLFxuICAgICAgICAgICAgdmFsdWU6IHsgcm91dGVJZDogbXNnLnJvdXRlX2lkIHx8IFwiXCIsIHg6IG1zZy54LCB5OiBtc2cueSwgc3BlZWQ6IG1zZy5zcGVlZCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pKTtcbiAgICAgICAgcmV0dXJuO1xuXG4gICAgICBjYXNlIFwidXBkYXRlX21pc3NpbGVfd2F5cG9pbnRfc3BlZWRcIjpcbiAgICAgICAgc2VuZFByb3RvKGNyZWF0ZShXc0VudmVsb3BlU2NoZW1hLCB7XG4gICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgY2FzZTogXCJ1cGRhdGVNaXNzaWxlV2F5cG9pbnRTcGVlZFwiLFxuICAgICAgICAgICAgdmFsdWU6IHsgcm91dGVJZDogbXNnLnJvdXRlX2lkIHx8IFwiXCIsIGluZGV4OiBtc2cuaW5kZXgsIHNwZWVkOiBtc2cuc3BlZWQgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KSk7XG4gICAgICAgIHJldHVybjtcblxuICAgICAgY2FzZSBcIm1vdmVfbWlzc2lsZV93YXlwb2ludFwiOlxuICAgICAgICBzZW5kUHJvdG8oY3JlYXRlKFdzRW52ZWxvcGVTY2hlbWEsIHtcbiAgICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgICBjYXNlOiBcIm1vdmVNaXNzaWxlV2F5cG9pbnRcIixcbiAgICAgICAgICAgIHZhbHVlOiB7IHJvdXRlSWQ6IG1zZy5yb3V0ZV9pZCB8fCBcIlwiLCBpbmRleDogbXNnLmluZGV4LCB4OiBtc2cueCwgeTogbXNnLnkgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KSk7XG4gICAgICAgIHJldHVybjtcblxuICAgICAgY2FzZSBcImRlbGV0ZV9taXNzaWxlX3dheXBvaW50XCI6XG4gICAgICAgIHNlbmRQcm90byhjcmVhdGUoV3NFbnZlbG9wZVNjaGVtYSwge1xuICAgICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICAgIGNhc2U6IFwiZGVsZXRlTWlzc2lsZVdheXBvaW50XCIsXG4gICAgICAgICAgICB2YWx1ZTogeyByb3V0ZUlkOiBtc2cucm91dGVfaWQgfHwgXCJcIiwgaW5kZXg6IG1zZy5pbmRleCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pKTtcbiAgICAgICAgcmV0dXJuO1xuXG4gICAgICBjYXNlIFwiY2xlYXJfbWlzc2lsZV9yb3V0ZVwiOlxuICAgICAgICBzZW5kUHJvdG8oY3JlYXRlKFdzRW52ZWxvcGVTY2hlbWEsIHtcbiAgICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgICBjYXNlOiBcImNsZWFyTWlzc2lsZVJvdXRlXCIsXG4gICAgICAgICAgICB2YWx1ZTogeyByb3V0ZUlkOiBtc2cucm91dGVfaWQgfHwgXCJcIiB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pKTtcbiAgICAgICAgcmV0dXJuO1xuXG4gICAgICBjYXNlIFwiYWRkX21pc3NpbGVfcm91dGVcIjpcbiAgICAgICAgc2VuZFByb3RvKGNyZWF0ZShXc0VudmVsb3BlU2NoZW1hLCB7XG4gICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgY2FzZTogXCJhZGRNaXNzaWxlUm91dGVcIixcbiAgICAgICAgICAgIHZhbHVlOiB7IG5hbWU6IG1zZy5uYW1lIHx8IFwiXCIgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KSk7XG4gICAgICAgIHJldHVybjtcblxuICAgICAgY2FzZSBcInJlbmFtZV9taXNzaWxlX3JvdXRlXCI6XG4gICAgICAgIHNlbmRQcm90byhjcmVhdGUoV3NFbnZlbG9wZVNjaGVtYSwge1xuICAgICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICAgIGNhc2U6IFwicmVuYW1lTWlzc2lsZVJvdXRlXCIsXG4gICAgICAgICAgICB2YWx1ZTogeyByb3V0ZUlkOiBtc2cucm91dGVfaWQgfHwgXCJcIiwgbmFtZTogbXNnLm5hbWUgfHwgXCJcIiB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pKTtcbiAgICAgICAgcmV0dXJuO1xuXG4gICAgICBjYXNlIFwiZGVsZXRlX21pc3NpbGVfcm91dGVcIjpcbiAgICAgICAgc2VuZFByb3RvKGNyZWF0ZShXc0VudmVsb3BlU2NoZW1hLCB7XG4gICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgY2FzZTogXCJkZWxldGVNaXNzaWxlUm91dGVcIixcbiAgICAgICAgICAgIHZhbHVlOiB7IHJvdXRlSWQ6IG1zZy5yb3V0ZV9pZCB8fCBcIlwiIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSkpO1xuICAgICAgICByZXR1cm47XG5cbiAgICAgIGNhc2UgXCJzZXRfYWN0aXZlX21pc3NpbGVfcm91dGVcIjpcbiAgICAgICAgc2VuZFByb3RvKGNyZWF0ZShXc0VudmVsb3BlU2NoZW1hLCB7XG4gICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgY2FzZTogXCJzZXRBY3RpdmVNaXNzaWxlUm91dGVcIixcbiAgICAgICAgICAgIHZhbHVlOiB7IHJvdXRlSWQ6IG1zZy5yb3V0ZV9pZCB8fCBcIlwiIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSkpO1xuICAgICAgICByZXR1cm47XG5cbiAgICAgIGNhc2UgXCJkYWdfc3RhcnRcIjpcbiAgICAgICAgc2VuZFByb3RvKGNyZWF0ZShXc0VudmVsb3BlU2NoZW1hLCB7XG4gICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgY2FzZTogXCJkYWdTdGFydFwiLFxuICAgICAgICAgICAgdmFsdWU6IHsgbm9kZUlkOiBtc2cubm9kZV9pZCB8fCBcIlwiIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSkpO1xuICAgICAgICByZXR1cm47XG5cbiAgICAgIGNhc2UgXCJjbGVhcl9taXNzaWxlX3dheXBvaW50c1wiOlxuICAgICAgICBzZW5kUHJvdG8oY3JlYXRlKFdzRW52ZWxvcGVTY2hlbWEsIHtcbiAgICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgICBjYXNlOiBcImNsZWFyTWlzc2lsZVdheXBvaW50c1wiLFxuICAgICAgICAgICAgdmFsdWU6IHsgcm91dGVJZDogbXNnLnJvdXRlX2lkIHx8IFwiXCIgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KSk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gIH1cbn1cblxuLy8gPT09PT09PT09PSBQaGFzZSAyOiBEQUcgQ29tbWFuZCBGdW5jdGlvbnMgPT09PT09PT09PVxuXG5leHBvcnQgZnVuY3Rpb24gc2VuZERhZ1N0YXJ0KG5vZGVJZDogc3RyaW5nKTogdm9pZCB7XG4gIGlmICghd3MgfHwgd3MucmVhZHlTdGF0ZSAhPT0gV2ViU29ja2V0Lk9QRU4pIHJldHVybjtcbiAgc2VuZFByb3RvKGNyZWF0ZShXc0VudmVsb3BlU2NoZW1hLCB7XG4gICAgcGF5bG9hZDoge1xuICAgICAgY2FzZTogXCJkYWdTdGFydFwiLFxuICAgICAgdmFsdWU6IHsgbm9kZUlkIH0sXG4gICAgfSxcbiAgfSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2VuZERhZ0NhbmNlbChub2RlSWQ6IHN0cmluZyk6IHZvaWQge1xuICBpZiAoIXdzIHx8IHdzLnJlYWR5U3RhdGUgIT09IFdlYlNvY2tldC5PUEVOKSByZXR1cm47XG4gIHNlbmRQcm90byhjcmVhdGUoV3NFbnZlbG9wZVNjaGVtYSwge1xuICAgIHBheWxvYWQ6IHtcbiAgICAgIGNhc2U6IFwiZGFnQ2FuY2VsXCIsXG4gICAgICB2YWx1ZTogeyBub2RlSWQgfSxcbiAgICB9LFxuICB9KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZW5kRGFnU3RvcnlBY2sobm9kZUlkOiBzdHJpbmcsIGNob2ljZUlkOiBzdHJpbmcgPSBcIlwiKTogdm9pZCB7XG4gIGlmICghd3MgfHwgd3MucmVhZHlTdGF0ZSAhPT0gV2ViU29ja2V0Lk9QRU4pIHJldHVybjtcbiAgc2VuZFByb3RvKGNyZWF0ZShXc0VudmVsb3BlU2NoZW1hLCB7XG4gICAgcGF5bG9hZDoge1xuICAgICAgY2FzZTogXCJkYWdTdG9yeUFja1wiLFxuICAgICAgdmFsdWU6IHsgbm9kZUlkLCBjaG9pY2VJZCB9LFxuICAgIH0sXG4gIH0pKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNlbmREYWdMaXN0KCk6IHZvaWQge1xuICBpZiAoIXdzIHx8IHdzLnJlYWR5U3RhdGUgIT09IFdlYlNvY2tldC5PUEVOKSByZXR1cm47XG4gIHNlbmRQcm90byhjcmVhdGUoV3NFbnZlbG9wZVNjaGVtYSwge1xuICAgIHBheWxvYWQ6IHtcbiAgICAgIGNhc2U6IFwiZGFnTGlzdFwiLFxuICAgICAgdmFsdWU6IHt9LFxuICAgIH0sXG4gIH0pKTtcbn1cblxuLy8gPT09PT09PT09PSBQaGFzZSAyOiBNaXNzaW9uIEV2ZW50IEZ1bmN0aW9ucyA9PT09PT09PT09XG5cbmV4cG9ydCBmdW5jdGlvbiBzZW5kTWlzc2lvblNwYXduV2F2ZSh3YXZlSW5kZXg6IG51bWJlcik6IHZvaWQge1xuICBpZiAoIXdzIHx8IHdzLnJlYWR5U3RhdGUgIT09IFdlYlNvY2tldC5PUEVOKSByZXR1cm47XG4gIHNlbmRQcm90byhjcmVhdGUoV3NFbnZlbG9wZVNjaGVtYSwge1xuICAgIHBheWxvYWQ6IHtcbiAgICAgIGNhc2U6IFwibWlzc2lvblNwYXduV2F2ZVwiLFxuICAgICAgdmFsdWU6IHsgd2F2ZUluZGV4IH0sXG4gICAgfSxcbiAgfSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2VuZE1pc3Npb25TdG9yeUV2ZW50KGV2ZW50OiBzdHJpbmcsIGJlYWNvbjogbnVtYmVyID0gMCk6IHZvaWQge1xuICBpZiAoIXdzIHx8IHdzLnJlYWR5U3RhdGUgIT09IFdlYlNvY2tldC5PUEVOKSByZXR1cm47XG4gIHNlbmRQcm90byhjcmVhdGUoV3NFbnZlbG9wZVNjaGVtYSwge1xuICAgIHBheWxvYWQ6IHtcbiAgICAgIGNhc2U6IFwibWlzc2lvblN0b3J5RXZlbnRcIixcbiAgICAgIHZhbHVlOiB7IGV2ZW50LCBiZWFjb24gfSxcbiAgICB9LFxuICB9KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb25uZWN0V2ViU29ja2V0KHtcbiAgcm9vbSxcbiAgc3RhdGUsXG4gIGJ1cyxcbiAgb25TdGF0ZVVwZGF0ZWQsXG4gIG9uT3BlbixcbiAgbWFwVyxcbiAgbWFwSCxcbiAgbW9kZSxcbiAgbWlzc2lvbklkLFxufTogQ29ubmVjdE9wdGlvbnMpOiB2b2lkIHtcbiAgY29uc3QgcHJvdG9jb2wgPSB3aW5kb3cubG9jYXRpb24ucHJvdG9jb2wgPT09IFwiaHR0cHM6XCIgPyBcIndzczovL1wiIDogXCJ3czovL1wiO1xuICBsZXQgd3NVcmwgPSBgJHtwcm90b2NvbH0ke3dpbmRvdy5sb2NhdGlvbi5ob3N0fS93cz9yb29tPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHJvb20pfWA7XG4gIGlmIChtYXBXICYmIG1hcFcgPiAwKSB7XG4gICAgd3NVcmwgKz0gYCZtYXBXPSR7bWFwV31gO1xuICB9XG4gIGlmIChtYXBIICYmIG1hcEggPiAwKSB7XG4gICAgd3NVcmwgKz0gYCZtYXBIPSR7bWFwSH1gO1xuICB9XG4gIGlmIChtb2RlKSB7XG4gICAgd3NVcmwgKz0gYCZtb2RlPSR7ZW5jb2RlVVJJQ29tcG9uZW50KG1vZGUpfWA7XG4gIH1cbiAgaWYgKG1pc3Npb25JZCkge1xuICAgIHdzVXJsICs9IGAmbWlzc2lvbj0ke2VuY29kZVVSSUNvbXBvbmVudChtaXNzaW9uSWQpfWA7XG4gIH1cbiAgd3MgPSBuZXcgV2ViU29ja2V0KHdzVXJsKTtcbiAgLy8gU2V0IGJpbmFyeSB0eXBlIGZvciBwcm90b2J1ZiBtZXNzYWdlc1xuICB3cy5iaW5hcnlUeXBlID0gXCJhcnJheWJ1ZmZlclwiO1xuICB3cy5hZGRFdmVudExpc3RlbmVyKFwib3BlblwiLCAoKSA9PiB7XG4gICAgY29uc29sZS5sb2coXCJbd3NdIG9wZW5cIik7XG4gICAgY29uc3Qgc29ja2V0ID0gd3M7XG4gICAgaWYgKHNvY2tldCAmJiBvbk9wZW4pIHtcbiAgICAgIG9uT3Blbihzb2NrZXQpO1xuICAgIH1cbiAgfSk7XG4gIHdzLmFkZEV2ZW50TGlzdGVuZXIoXCJjbG9zZVwiLCAoKSA9PiBjb25zb2xlLmxvZyhcIlt3c10gY2xvc2VcIikpO1xuXG4gIGxldCBwcmV2Um91dGVzID0gbmV3IE1hcDxzdHJpbmcsIE1pc3NpbGVSb3V0ZT4oKTtcbiAgbGV0IHByZXZBY3RpdmVSb3V0ZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGxldCBwcmV2TWlzc2lsZUNvdW50ID0gMDtcblxuICB3cy5hZGRFdmVudExpc3RlbmVyKFwibWVzc2FnZVwiLCAoZXZlbnQpID0+IHtcbiAgICAvLyBIYW5kbGUgYmluYXJ5IHByb3RvYnVmIG1lc3NhZ2VzXG4gICAgaWYgKGV2ZW50LmRhdGEgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZW52ZWxvcGUgPSBmcm9tQmluYXJ5KFdzRW52ZWxvcGVTY2hlbWEsIG5ldyBVaW50OEFycmF5KGV2ZW50LmRhdGEpKTtcblxuICAgICAgICBpZiAoZW52ZWxvcGUucGF5bG9hZC5jYXNlID09PSBcInN0YXRlVXBkYXRlXCIpIHtcbiAgICAgICAgICBjb25zdCBwcm90b1N0YXRlID0gcHJvdG9Ub1N0YXRlKGVudmVsb3BlLnBheWxvYWQudmFsdWUpO1xuICAgICAgICAgIGhhbmRsZVByb3RvU3RhdGVNZXNzYWdlKHN0YXRlLCBwcm90b1N0YXRlLCBidXMsIHByZXZSb3V0ZXMsIHByZXZBY3RpdmVSb3V0ZSwgcHJldk1pc3NpbGVDb3VudCk7XG4gICAgICAgICAgcHJldlJvdXRlcyA9IG5ldyBNYXAoc3RhdGUubWlzc2lsZVJvdXRlcy5tYXAoKHJvdXRlKSA9PiBbcm91dGUuaWQsIGNsb25lUm91dGUocm91dGUpXSkpO1xuICAgICAgICAgIHByZXZBY3RpdmVSb3V0ZSA9IHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkO1xuICAgICAgICAgIHByZXZNaXNzaWxlQ291bnQgPSBzdGF0ZS5taXNzaWxlcy5sZW5ndGg7XG4gICAgICAgICAgYnVzLmVtaXQoXCJzdGF0ZTp1cGRhdGVkXCIpO1xuICAgICAgICAgIG9uU3RhdGVVcGRhdGVkPy4oKTtcbiAgICAgICAgfSBlbHNlIGlmIChlbnZlbG9wZS5wYXlsb2FkLmNhc2UgPT09IFwicm9vbUZ1bGxcIikge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJbd3NdIFJvb20gZnVsbDpcIiwgZW52ZWxvcGUucGF5bG9hZC52YWx1ZS5tZXNzYWdlKTtcbiAgICAgICAgICBidXMuZW1pdChcImNvbm5lY3Rpb246ZXJyb3JcIiwgeyBtZXNzYWdlOiBlbnZlbG9wZS5wYXlsb2FkLnZhbHVlLm1lc3NhZ2UgfSk7XG4gICAgICAgIH0gZWxzZSBpZiAoZW52ZWxvcGUucGF5bG9hZC5jYXNlID09PSBcImRhZ0xpc3RSZXNwb25zZVwiKSB7XG4gICAgICAgICAgLy8gSGFuZGxlIERBRyBsaXN0IHJlc3BvbnNlIGZyb20gUGhhc2UgMlxuICAgICAgICAgIGNvbnN0IGRhZ0RhdGEgPSBlbnZlbG9wZS5wYXlsb2FkLnZhbHVlLmRhZztcbiAgICAgICAgICBpZiAoZGFnRGF0YSkge1xuICAgICAgICAgICAgYnVzLmVtaXQoXCJkYWc6bGlzdFwiLCBwcm90b1RvRGFnU3RhdGUoZGFnRGF0YSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zb2xlLndhcm4oXCJbd3NdIFVua25vd24gcHJvdG9idWYgbWVzc2FnZSB0eXBlOlwiLCBlbnZlbG9wZS5wYXlsb2FkLmNhc2UpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIlt3c10gRmFpbGVkIHRvIGRlY29kZSBwcm90b2J1ZiBtZXNzYWdlOlwiLCBlcnIpO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgfSk7XG59XG5cblxuLy8gSGFuZGxlIHByb3RvYnVmIHN0YXRlIG1lc3NhZ2VzIChzaW1wbGlmaWVkIHZlcnNpb24gb2YgaGFuZGxlU3RhdGVNZXNzYWdlKVxuZnVuY3Rpb24gaGFuZGxlUHJvdG9TdGF0ZU1lc3NhZ2UoXG4gIHN0YXRlOiBBcHBTdGF0ZSxcbiAgbXNnOiBSZXR1cm5UeXBlPHR5cGVvZiBwcm90b1RvU3RhdGU+LFxuICBidXM6IEV2ZW50QnVzLFxuICBwcmV2Um91dGVzOiBNYXA8c3RyaW5nLCBNaXNzaWxlUm91dGU+LFxuICBwcmV2QWN0aXZlUm91dGU6IHN0cmluZyB8IG51bGwsXG4gIHByZXZNaXNzaWxlQ291bnQ6IG51bWJlcixcbik6IHZvaWQge1xuICBzdGF0ZS5ub3cgPSBtc2cubm93O1xuICBzdGF0ZS5ub3dTeW5jZWRBdCA9IG1vbm90b25pY05vdygpO1xuICBzdGF0ZS5uZXh0TWlzc2lsZVJlYWR5QXQgPSBtc2cubmV4dE1pc3NpbGVSZWFkeTtcblxuICAvLyBVcGRhdGUgcGxheWVyIHNoaXBcbiAgaWYgKG1zZy5tZSkge1xuICAgIHN0YXRlLm1lID0ge1xuICAgICAgeDogbXNnLm1lLngsXG4gICAgICB5OiBtc2cubWUueSxcbiAgICAgIHZ4OiBtc2cubWUudngsXG4gICAgICB2eTogbXNnLm1lLnZ5LFxuICAgICAgaHA6IG1zZy5tZS5ocCxcbiAgICAgIGtpbGxzOiBtc2cubWUua2lsbHMsXG4gICAgICB3YXlwb2ludHM6IG1zZy5tZS53YXlwb2ludHMgPz8gW10sXG4gICAgICBjdXJyZW50V2F5cG9pbnRJbmRleDogbXNnLm1lLmN1cnJlbnRXYXlwb2ludEluZGV4ID8/IDAsXG4gICAgICBoZWF0OiBtc2cubWUuaGVhdCA/IGNvbnZlcnRIZWF0Vmlldyhtc2cubWUuaGVhdCwgc3RhdGUubm93U3luY2VkQXQsIHN0YXRlLm5vdykgOiB1bmRlZmluZWQsXG4gICAgfTtcbiAgfSBlbHNlIHtcbiAgICBzdGF0ZS5tZSA9IG51bGw7XG4gIH1cblxuICAvLyBVcGRhdGUgZ2hvc3RzIGFuZCBtaXNzaWxlcyAoYWxyZWFkeSBpbiBjb3JyZWN0IGZvcm1hdCBmcm9tIHByb3RvX2hlbHBlcnMpXG4gIHN0YXRlLmdob3N0cyA9IG1zZy5naG9zdHM7XG4gIHN0YXRlLm1pc3NpbGVzID0gbXNnLm1pc3NpbGVzO1xuXG4gIC8vIFVwZGF0ZSBtaXNzaWxlIHJvdXRlc1xuICBjb25zdCBuZXdSb3V0ZXM6IE1pc3NpbGVSb3V0ZVtdID0gbXNnLm1pc3NpbGVSb3V0ZXM7XG4gIGRpZmZSb3V0ZXMocHJldlJvdXRlcywgbmV3Um91dGVzLCBidXMpO1xuICBzdGF0ZS5taXNzaWxlUm91dGVzID0gbmV3Um91dGVzO1xuXG4gIC8vIFVwZGF0ZSBhY3RpdmUgcm91dGVcbiAgY29uc3QgbmV4dEFjdGl2ZSA9IG1zZy5hY3RpdmVNaXNzaWxlUm91dGUgfHwgKG5ld1JvdXRlcy5sZW5ndGggPiAwID8gbmV3Um91dGVzWzBdLmlkIDogbnVsbCk7XG4gIHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gbmV4dEFjdGl2ZTtcbiAgaWYgKG5leHRBY3RpdmUgIT09IHByZXZBY3RpdmVSb3V0ZSkge1xuICAgIGJ1cy5lbWl0KFwibWlzc2lsZTphY3RpdmVSb3V0ZUNoYW5nZWRcIiwgeyByb3V0ZUlkOiBuZXh0QWN0aXZlIH0pO1xuICB9XG5cbiAgLy8gVXBkYXRlIG1pc3NpbGUgY29uZmlnXG4gIGlmIChtc2cubWlzc2lsZUNvbmZpZykge1xuICAgIHVwZGF0ZU1pc3NpbGVMaW1pdHMoc3RhdGUsIHtcbiAgICAgIHNwZWVkTWluOiBtc2cubWlzc2lsZUNvbmZpZy5zcGVlZE1pbixcbiAgICAgIHNwZWVkTWF4OiBtc2cubWlzc2lsZUNvbmZpZy5zcGVlZE1heCxcbiAgICAgIGFncm9NaW46IG1zZy5taXNzaWxlQ29uZmlnLmFncm9NaW4sXG4gICAgfSk7XG5cbiAgICBjb25zdCBwcmV2SGVhdCA9IHN0YXRlLm1pc3NpbGVDb25maWcuaGVhdFBhcmFtcztcbiAgICBsZXQgaGVhdFBhcmFtczogeyBtYXg6IG51bWJlcjsgd2FybkF0OiBudW1iZXI7IG92ZXJoZWF0QXQ6IG51bWJlcjsgbWFya2VyU3BlZWQ6IG51bWJlcjsga1VwOiBudW1iZXI7IGtEb3duOiBudW1iZXI7IGV4cDogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG4gICAgaWYgKG1zZy5taXNzaWxlQ29uZmlnLmhlYXRDb25maWcpIHtcbiAgICAgIGNvbnN0IGhlYXRDb25maWcgPSBtc2cubWlzc2lsZUNvbmZpZy5oZWF0Q29uZmlnO1xuICAgICAgaGVhdFBhcmFtcyA9IHtcbiAgICAgICAgbWF4OiBoZWF0Q29uZmlnLm1heCA/PyBwcmV2SGVhdD8ubWF4ID8/IDAsXG4gICAgICAgIHdhcm5BdDogaGVhdENvbmZpZy53YXJuQXQgPz8gcHJldkhlYXQ/Lndhcm5BdCA/PyAwLFxuICAgICAgICBvdmVyaGVhdEF0OiBoZWF0Q29uZmlnLm92ZXJoZWF0QXQgPz8gcHJldkhlYXQ/Lm92ZXJoZWF0QXQgPz8gMCxcbiAgICAgICAgbWFya2VyU3BlZWQ6IGhlYXRDb25maWcubWFya2VyU3BlZWQgPz8gcHJldkhlYXQ/Lm1hcmtlclNwZWVkID8/IDAsXG4gICAgICAgIGtVcDogaGVhdENvbmZpZy5rVXAgPz8gcHJldkhlYXQ/LmtVcCA/PyAwLFxuICAgICAgICBrRG93bjogaGVhdENvbmZpZy5rRG93biA/PyBwcmV2SGVhdD8ua0Rvd24gPz8gMCxcbiAgICAgICAgZXhwOiBoZWF0Q29uZmlnLmV4cCA/PyBwcmV2SGVhdD8uZXhwID8/IDEsXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IHNhbml0aXplZCA9IHNhbml0aXplTWlzc2lsZUNvbmZpZyh7XG4gICAgICBzcGVlZDogbXNnLm1pc3NpbGVDb25maWcuc3BlZWQsXG4gICAgICBhZ3JvUmFkaXVzOiBtc2cubWlzc2lsZUNvbmZpZy5hZ3JvUmFkaXVzLFxuICAgICAgaGVhdFBhcmFtcyxcbiAgICB9LCBzdGF0ZS5taXNzaWxlQ29uZmlnLCBzdGF0ZS5taXNzaWxlTGltaXRzKTtcbiAgICBzYW5pdGl6ZWQubGlmZXRpbWUgPSBtc2cubWlzc2lsZUNvbmZpZy5saWZldGltZTtcbiAgICBzdGF0ZS5taXNzaWxlQ29uZmlnID0gc2FuaXRpemVkO1xuICB9XG5cbiAgLy8gVXBkYXRlIHdvcmxkIG1ldGFcbiAgc3RhdGUud29ybGRNZXRhID0ge1xuICAgIGM6IG1zZy5tZXRhLmMsXG4gICAgdzogbXNnLm1ldGEudyxcbiAgICBoOiBtc2cubWV0YS5oLFxuICB9O1xuXG4gIC8vIFBoYXNlIDI6IFVwZGF0ZSBpbnZlbnRvcnlcbiAgaWYgKG1zZy5pbnZlbnRvcnkpIHtcbiAgICBzdGF0ZS5pbnZlbnRvcnkgPSB7XG4gICAgICBpdGVtczogbXNnLmludmVudG9yeS5pdGVtcy5tYXAoKGl0ZW0pID0+ICh7XG4gICAgICAgIHR5cGU6IGl0ZW0udHlwZSxcbiAgICAgICAgdmFyaWFudF9pZDogaXRlbS52YXJpYW50SWQsXG4gICAgICAgIGhlYXRfY2FwYWNpdHk6IGl0ZW0uaGVhdENhcGFjaXR5LFxuICAgICAgICBxdWFudGl0eTogaXRlbS5xdWFudGl0eSxcbiAgICAgIH0pKSxcbiAgICB9O1xuICB9XG5cbiAgLy8gUGhhc2UgMjogVXBkYXRlIERBR1xuICBpZiAobXNnLmRhZykge1xuICAgIHN0YXRlLmRhZyA9IHtcbiAgICAgIG5vZGVzOiBtc2cuZGFnLm5vZGVzLm1hcCgobm9kZSkgPT4gKHtcbiAgICAgICAgaWQ6IG5vZGUuaWQsXG4gICAgICAgIGtpbmQ6IG5vZGUua2luZCxcbiAgICAgICAgbGFiZWw6IG5vZGUubGFiZWwsXG4gICAgICAgIHN0YXR1czogbm9kZS5zdGF0dXMsXG4gICAgICAgIHJlbWFpbmluZ19zOiBub2RlLnJlbWFpbmluZ1MsXG4gICAgICAgIGR1cmF0aW9uX3M6IG5vZGUuZHVyYXRpb25TLFxuICAgICAgICByZXBlYXRhYmxlOiBub2RlLnJlcGVhdGFibGUsXG4gICAgICAgIGVmZmVjdHM6IG5vZGUuZWZmZWN0cyB8fCBbXSxcbiAgICAgIH0pKSxcbiAgICB9O1xuICB9XG5cbiAgLy8gUGhhc2UgMjogVXBkYXRlIGNhcGFiaWxpdGllc1xuICBpZiAobXNnLmNhcGFiaWxpdGllcykge1xuICAgIHN0YXRlLmNhcGFiaWxpdGllcyA9IHtcbiAgICAgIHNwZWVkTXVsdGlwbGllcjogbXNnLmNhcGFiaWxpdGllcy5zcGVlZE11bHRpcGxpZXIsXG4gICAgICB1bmxvY2tlZE1pc3NpbGVzOiBtc2cuY2FwYWJpbGl0aWVzLnVubG9ja2VkTWlzc2lsZXMsXG4gICAgICBoZWF0Q2FwYWNpdHk6IG1zZy5jYXBhYmlsaXRpZXMuaGVhdENhcGFjaXR5LFxuICAgICAgaGVhdEVmZmljaWVuY3k6IG1zZy5jYXBhYmlsaXRpZXMuaGVhdEVmZmljaWVuY3ksXG4gICAgfTtcbiAgfVxuXG4gIC8vIFBoYXNlIDI6IFVwZGF0ZSBzdG9yeVxuICBpZiAobXNnLnN0b3J5KSB7XG4gICAgY29uc3QgcHJldkFjdGl2ZU5vZGUgPSBzdGF0ZS5zdG9yeT8uYWN0aXZlTm9kZSA/PyBudWxsO1xuXG4gICAgLy8gQ29udmVydCBzdG9yeSBkaWFsb2d1ZSB0byBEaWFsb2d1ZUNvbnRlbnQgZm9ybWF0XG4gICAgbGV0IGRpYWxvZ3VlOiBEaWFsb2d1ZUNvbnRlbnQgfCBudWxsID0gbnVsbDtcbiAgICBpZiAobXNnLnN0b3J5LmRpYWxvZ3VlKSB7XG4gICAgICBjb25zdCBkID0gbXNnLnN0b3J5LmRpYWxvZ3VlO1xuICAgICAgZGlhbG9ndWUgPSB7XG4gICAgICAgIHNwZWFrZXI6IGQuc3BlYWtlcixcbiAgICAgICAgdGV4dDogZC50ZXh0LFxuICAgICAgICBpbnRlbnQ6IGQuaW50ZW50IGFzIFwiZmFjdG9yeVwiIHwgXCJ1bml0XCIsXG4gICAgICAgIHR5cGluZ1NwZWVkTXM6IDE4LFxuICAgICAgICBjb250aW51ZUxhYmVsOiBkLmNvbnRpbnVlTGFiZWwsXG4gICAgICAgIGNob2ljZXM6IGQuY2hvaWNlcz8ubWFwKGMgPT4gKHsgaWQ6IGMuaWQsIHRleHQ6IGMudGV4dCB9KSksXG4gICAgICAgIHR1dG9yaWFsVGlwOiBkLnR1dG9yaWFsVGlwID8ge1xuICAgICAgICAgIHRpdGxlOiBkLnR1dG9yaWFsVGlwLnRpdGxlLFxuICAgICAgICAgIHRleHQ6IGQudHV0b3JpYWxUaXAudGV4dCxcbiAgICAgICAgfSA6IHVuZGVmaW5lZCxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgc3RhdGUuc3RvcnkgPSB7XG4gICAgICBhY3RpdmVOb2RlOiBtc2cuc3RvcnkuYWN0aXZlTm9kZSB8fCBudWxsLFxuICAgICAgZGlhbG9ndWUsXG4gICAgICBhdmFpbGFibGU6IG1zZy5zdG9yeS5hdmFpbGFibGUsXG4gICAgICBmbGFnczogbXNnLnN0b3J5LmZsYWdzLFxuICAgICAgcmVjZW50RXZlbnRzOiBtc2cuc3RvcnkucmVjZW50RXZlbnRzLm1hcCgoZXZ0KSA9PiAoe1xuICAgICAgICBjaGFwdGVyOiBldnQuY2hhcHRlcklkLFxuICAgICAgICBub2RlOiBldnQubm9kZUlkLFxuICAgICAgICB0aW1lc3RhbXA6IGV2dC50aW1lc3RhbXAsXG4gICAgICB9KSksXG4gICAgfTtcblxuICAgIC8vIEVtaXQgZXZlbnQgd2hlbiBhY3RpdmUgc3Rvcnkgbm9kZSBjaGFuZ2VzXG4gICAgaWYgKHN0YXRlLnN0b3J5LmFjdGl2ZU5vZGUgIT09IHByZXZBY3RpdmVOb2RlICYmIHN0YXRlLnN0b3J5LmFjdGl2ZU5vZGUpIHtcbiAgICAgIGJ1cy5lbWl0KFwic3Rvcnk6bm9kZUFjdGl2YXRlZFwiLCB7XG4gICAgICAgIG5vZGVJZDogc3RhdGUuc3RvcnkuYWN0aXZlTm9kZSxcbiAgICAgICAgZGlhbG9ndWU6IHN0YXRlLnN0b3J5LmRpYWxvZ3VlID8/IHVuZGVmaW5lZCxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIC8vIEVtaXQgbWlzc2lsZSBjb3VudCBjaGFuZ2UgaWYgbmVlZGVkXG4gIGNvbnN0IG5ld01pc3NpbGVDb3VudCA9IHN0YXRlLm1pc3NpbGVzLmxlbmd0aDtcbiAgaWYgKG5ld01pc3NpbGVDb3VudCA+IHByZXZNaXNzaWxlQ291bnQpIHtcbiAgICBmb3IgKGxldCBpID0gcHJldk1pc3NpbGVDb3VudDsgaSA8IG5ld01pc3NpbGVDb3VudDsgaSsrKSB7XG4gICAgICBjb25zdCBtID0gc3RhdGUubWlzc2lsZXNbaV07XG4gICAgICBpZiAobSAmJiBtLnNlbGYpIHtcbiAgICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOmxhdW5jaGVkXCIsIHsgcm91dGVJZDogbXNnLmFjdGl2ZU1pc3NpbGVSb3V0ZSB8fCBcIlwiIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIEVtaXQgY29vbGRvd24gdXBkYXRlXG4gIGNvbnN0IGNvb2xkb3duUmVtYWluaW5nID0gTWF0aC5tYXgoMCwgc3RhdGUubmV4dE1pc3NpbGVSZWFkeUF0IC0gZ2V0QXBwcm94U2VydmVyTm93KHN0YXRlKSk7XG4gIGJ1cy5lbWl0KFwibWlzc2lsZTpjb29sZG93blVwZGF0ZWRcIiwgeyBzZWNvbmRzUmVtYWluaW5nOiBjb29sZG93blJlbWFpbmluZyB9KTtcbn1cblxuZnVuY3Rpb24gZGlmZlJvdXRlcyhwcmV2Um91dGVzOiBNYXA8c3RyaW5nLCBNaXNzaWxlUm91dGU+LCBuZXh0Um91dGVzOiBNaXNzaWxlUm91dGVbXSwgYnVzOiBFdmVudEJ1cyk6IHZvaWQge1xuICBjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIGZvciAoY29uc3Qgcm91dGUgb2YgbmV4dFJvdXRlcykge1xuICAgIHNlZW4uYWRkKHJvdXRlLmlkKTtcbiAgICBjb25zdCBwcmV2ID0gcHJldlJvdXRlcy5nZXQocm91dGUuaWQpO1xuICAgIGlmICghcHJldikge1xuICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOnJvdXRlQWRkZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCB9KTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAocm91dGUubmFtZSAhPT0gcHJldi5uYW1lKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6cm91dGVSZW5hbWVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIG5hbWU6IHJvdXRlLm5hbWUgfSk7XG4gICAgfVxuICAgIGlmIChyb3V0ZS53YXlwb2ludHMubGVuZ3RoID4gcHJldi53YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkLCBpbmRleDogcm91dGUud2F5cG9pbnRzLmxlbmd0aCAtIDEgfSk7XG4gICAgfSBlbHNlIGlmIChyb3V0ZS53YXlwb2ludHMubGVuZ3RoIDwgcHJldi53YXlwb2ludHMubGVuZ3RoKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnREZWxldGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQsIGluZGV4OiBwcmV2LndheXBvaW50cy5sZW5ndGggLSAxIH0pO1xuICAgIH1cbiAgICBpZiAocHJldi53YXlwb2ludHMubGVuZ3RoID4gMCAmJiByb3V0ZS53YXlwb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBidXMuZW1pdChcIm1pc3NpbGU6d2F5cG9pbnRzQ2xlYXJlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkIH0pO1xuICAgIH1cbiAgfVxuICBmb3IgKGNvbnN0IFtyb3V0ZUlkXSBvZiBwcmV2Um91dGVzKSB7XG4gICAgaWYgKCFzZWVuLmhhcyhyb3V0ZUlkKSkge1xuICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOnJvdXRlRGVsZXRlZFwiLCB7IHJvdXRlSWQgfSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGNsb25lUm91dGUocm91dGU6IE1pc3NpbGVSb3V0ZSk6IE1pc3NpbGVSb3V0ZSB7XG4gIHJldHVybiB7XG4gICAgaWQ6IHJvdXRlLmlkLFxuICAgIG5hbWU6IHJvdXRlLm5hbWUsXG4gICAgd2F5cG9pbnRzOiByb3V0ZS53YXlwb2ludHMubWFwKCh3cCkgPT4gKHsgLi4ud3AgfSkpLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QXBwcm94U2VydmVyTm93KHN0YXRlOiBBcHBTdGF0ZSk6IG51bWJlciB7XG4gIGlmICghTnVtYmVyLmlzRmluaXRlKHN0YXRlLm5vdykpIHtcbiAgICByZXR1cm4gMDtcbiAgfVxuICBjb25zdCBzeW5jZWRBdCA9IE51bWJlci5pc0Zpbml0ZShzdGF0ZS5ub3dTeW5jZWRBdCkgPyBzdGF0ZS5ub3dTeW5jZWRBdCA6IG51bGw7XG4gIGlmICghc3luY2VkQXQpIHtcbiAgICByZXR1cm4gc3RhdGUubm93O1xuICB9XG4gIGNvbnN0IGVsYXBzZWRNcyA9IG1vbm90b25pY05vdygpIC0gc3luY2VkQXQ7XG4gIGlmICghTnVtYmVyLmlzRmluaXRlKGVsYXBzZWRNcykgfHwgZWxhcHNlZE1zIDwgMCkge1xuICAgIHJldHVybiBzdGF0ZS5ub3c7XG4gIH1cbiAgcmV0dXJuIHN0YXRlLm5vdyArIGVsYXBzZWRNcyAvIDEwMDA7XG59XG5cbmZ1bmN0aW9uIGNvbnZlcnRIZWF0VmlldyhzZXJ2ZXJIZWF0OiB7IHY6IG51bWJlcjsgbTogbnVtYmVyOyB3OiBudW1iZXI7IG86IG51bWJlcjsgbXM6IG51bWJlcjsgc3U6IG51bWJlcjsga3U6IG51bWJlcjsga2Q6IG51bWJlcjsgZXg6IG51bWJlciB9LCBub3dTeW5jZWRBdE1zOiBudW1iZXIsIHNlcnZlck5vd1NlYzogbnVtYmVyKTogaW1wb3J0KFwiLi9zdGF0ZVwiKS5IZWF0VmlldyB7XG4gIC8vIENvbnZlcnQgc2VydmVyIHRpbWUgKHN0YWxsVW50aWwgaW4gc2Vjb25kcykgdG8gY2xpZW50IHRpbWUgKG1pbGxpc2Vjb25kcylcbiAgLy8gc3RhbGxVbnRpbCBpcyBhYnNvbHV0ZSBzZXJ2ZXIgdGltZSwgc28gd2UgbmVlZCB0byBjb252ZXJ0IGl0IHRvIGNsaWVudCB0aW1lXG4gIGNvbnN0IHNlcnZlclN0YWxsVW50aWxTZWMgPSBzZXJ2ZXJIZWF0LnN1O1xuICBjb25zdCBvZmZzZXRGcm9tTm93U2VjID0gc2VydmVyU3RhbGxVbnRpbFNlYyAtIHNlcnZlck5vd1NlYztcbiAgY29uc3Qgc3RhbGxVbnRpbE1zID0gbm93U3luY2VkQXRNcyArIChvZmZzZXRGcm9tTm93U2VjICogMTAwMCk7XG5cbiAgY29uc3QgaGVhdFZpZXcgPSB7XG4gICAgdmFsdWU6IHNlcnZlckhlYXQudixcbiAgICBtYXg6IHNlcnZlckhlYXQubSxcbiAgICB3YXJuQXQ6IHNlcnZlckhlYXQudyxcbiAgICBvdmVyaGVhdEF0OiBzZXJ2ZXJIZWF0Lm8sXG4gICAgbWFya2VyU3BlZWQ6IHNlcnZlckhlYXQubXMsXG4gICAgc3RhbGxVbnRpbE1zOiBzdGFsbFVudGlsTXMsXG4gICAga1VwOiBzZXJ2ZXJIZWF0Lmt1LFxuICAgIGtEb3duOiBzZXJ2ZXJIZWF0LmtkLFxuICAgIGV4cDogc2VydmVySGVhdC5leCxcbiAgfTtcbiAgcmV0dXJuIGhlYXRWaWV3O1xufVxuIiwgImltcG9ydCB0eXBlIHsgRXZlbnRCdXMgfSBmcm9tIFwiLi9idXNcIjtcbmltcG9ydCB0eXBlIHsgQXBwU3RhdGUsIERhZ05vZGUgfSBmcm9tIFwiLi9zdGF0ZVwiO1xuaW1wb3J0IHsgc2VuZERhZ1N0YXJ0IH0gZnJvbSBcIi4vbmV0XCI7XG5cbmxldCBjb3VudGRvd25JbnRlcnZhbDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cbmV4cG9ydCBmdW5jdGlvbiBpbml0VXBncmFkZXNQYW5lbChcbiAgc3RhdGU6IEFwcFN0YXRlLFxuICBidXM6IEV2ZW50QnVzXG4pOiB2b2lkIHtcbiAgLy8gQ3JlYXRlIHBhbmVsIERPTSBzdHJ1Y3R1cmVcbiAgY29uc3QgcGFuZWwgPSBjcmVhdGVQYW5lbEVsZW1lbnQoKTtcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYW5lbCk7XG5cbiAgY29uc3QgY29udGFpbmVyID0gcGFuZWwucXVlcnlTZWxlY3RvcignLnRlY2gtdHJlZS1jb250YWluZXInKSBhcyBIVE1MRWxlbWVudDtcbiAgY29uc3QgY2xvc2VCdG4gPSBwYW5lbC5xdWVyeVNlbGVjdG9yKCcuY2xvc2UtYnRuJykgYXMgSFRNTEVsZW1lbnQ7XG4gIGNvbnN0IG92ZXJsYXkgPSBwYW5lbC5xdWVyeVNlbGVjdG9yKCcucGFuZWwtb3ZlcmxheScpIGFzIEhUTUxFbGVtZW50O1xuXG4gIC8vIFJlbmRlciBmdW5jdGlvblxuICBmdW5jdGlvbiByZW5kZXJVcGdyYWRlcygpIHtcbiAgICBjb25zdCB1cGdyYWRlTm9kZXMgPSBzdGF0ZS5kYWc/Lm5vZGVzLmZpbHRlcihuID0+IG4ua2luZCA9PT0gJ3VuaXQnKSB8fCBbXTtcbiAgICByZW5kZXJUZWNoVHJlZSh1cGdyYWRlTm9kZXMsIGNvbnRhaW5lcik7XG4gIH1cblxuICAvLyBUb2dnbGUgcGFuZWwgdmlzaWJpbGl0eVxuICBmdW5jdGlvbiB0b2dnbGVQYW5lbCh2aXNpYmxlOiBib29sZWFuKSB7XG4gICAgcGFuZWwuY2xhc3NMaXN0LnRvZ2dsZSgndmlzaWJsZScsIHZpc2libGUpO1xuICAgIGlmICh2aXNpYmxlKSB7XG4gICAgICByZW5kZXJVcGdyYWRlcygpO1xuICAgIH1cbiAgfVxuXG4gIC8vIEV2ZW50IGxpc3RlbmVyc1xuICBidXMub24oXCJ1cGdyYWRlczp0b2dnbGVcIiwgKCkgPT4ge1xuICAgIHRvZ2dsZVBhbmVsKCFwYW5lbC5jbGFzc0xpc3QuY29udGFpbnMoJ3Zpc2libGUnKSk7XG4gIH0pO1xuXG4gIGJ1cy5vbihcInVwZ3JhZGVzOnNob3dcIiwgKCkgPT4gdG9nZ2xlUGFuZWwodHJ1ZSkpO1xuICBidXMub24oXCJ1cGdyYWRlczpoaWRlXCIsICgpID0+IHRvZ2dsZVBhbmVsKGZhbHNlKSk7XG5cbiAgY2xvc2VCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHRvZ2dsZVBhbmVsKGZhbHNlKSk7XG4gIG92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHRvZ2dsZVBhbmVsKGZhbHNlKSk7XG5cbiAgLy8gU3Vic2NyaWJlIHRvIERBRyB1cGRhdGVzIChldmVudC1kcml2ZW4gcGF0dGVybilcbiAgYnVzLm9uKFwic3RhdGU6dXBkYXRlZFwiLCAoKSA9PiB7XG4gICAgaWYgKHBhbmVsLmNsYXNzTGlzdC5jb250YWlucygndmlzaWJsZScpKSB7XG4gICAgICByZW5kZXJVcGdyYWRlcygpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gSGFuZGxlIG5vZGUgY2xpY2tcbiAgY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xuICAgIGNvbnN0IG5vZGVFbCA9IChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuY2xvc2VzdChcIltkYXRhLW5vZGUtaWRdXCIpO1xuICAgIGlmICghbm9kZUVsKSByZXR1cm47XG5cbiAgICBjb25zdCBub2RlSWQgPSBub2RlRWwuZ2V0QXR0cmlidXRlKFwiZGF0YS1ub2RlLWlkXCIpO1xuICAgIGNvbnN0IG5vZGUgPSBzdGF0ZS5kYWc/Lm5vZGVzLmZpbmQobiA9PiBuLmlkID09PSBub2RlSWQpO1xuXG4gICAgaWYgKG5vZGU/LnN0YXR1cyA9PT0gXCJhdmFpbGFibGVcIikge1xuICAgICAgc2VuZERhZ1N0YXJ0KG5vZGVJZCEpO1xuICAgIH1cbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVBhbmVsRWxlbWVudCgpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHBhbmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gIHBhbmVsLmNsYXNzTmFtZSA9ICd1cGdyYWRlcy1wYW5lbCc7XG4gIHBhbmVsLmlubmVySFRNTCA9IGBcbiAgICA8ZGl2IGNsYXNzPVwicGFuZWwtb3ZlcmxheVwiPjwvZGl2PlxuICAgIDxkaXYgY2xhc3M9XCJwYW5lbC1jb250ZW50XCI+XG4gICAgICA8ZGl2IGNsYXNzPVwicGFuZWwtaGVhZGVyXCI+XG4gICAgICAgIDxoMj5TaGlwIFVwZ3JhZGVzPC9oMj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImNsb3NlLWJ0blwiPlx1MDBENzwvYnV0dG9uPlxuICAgICAgPC9kaXY+XG4gICAgICA8ZGl2IGNsYXNzPVwidGVjaC10cmVlLWNvbnRhaW5lclwiPjwvZGl2PlxuICAgIDwvZGl2PlxuICBgO1xuICByZXR1cm4gcGFuZWw7XG59XG5cbmZ1bmN0aW9uIHJlbmRlclRlY2hUcmVlKG5vZGVzOiBEYWdOb2RlW10sIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgY29udGFpbmVyLmlubmVySFRNTCA9IGBcbiAgICA8ZGl2IGNsYXNzPVwidGVjaC10cmVlXCI+XG4gICAgICAke25vZGVzLm1hcChyZW5kZXJOb2RlKS5qb2luKCcnKX1cbiAgICA8L2Rpdj5cbiAgYDtcbn1cblxuZnVuY3Rpb24gcmVuZGVyTm9kZShub2RlOiBEYWdOb2RlKTogc3RyaW5nIHtcbiAgY29uc3Qgc3RhdHVzQ2xhc3MgPSBgbm9kZS0ke25vZGUuc3RhdHVzfWA7XG4gIGNvbnN0IGVmZmVjdHNIdG1sID0gbm9kZS5lZmZlY3RzPy5tYXAoZSA9PiB7XG4gICAgaWYgKGUudHlwZSA9PT0gJ3NwZWVkX211bHRpcGxpZXInKSB7XG4gICAgICByZXR1cm4gYCskeygoZS52YWx1ZSBhcyBudW1iZXIgLSAxKSAqIDEwMCkudG9GaXhlZCgwKX0lIFNwZWVkYDtcbiAgICB9IGVsc2UgaWYgKGUudHlwZSA9PT0gJ21pc3NpbGVfdW5sb2NrJykge1xuICAgICAgcmV0dXJuIGBVbmxvY2sgJHtlLnZhbHVlfWA7XG4gICAgfSBlbHNlIGlmIChlLnR5cGUgPT09ICdoZWF0X2NhcGFjaXR5Jykge1xuICAgICAgcmV0dXJuIGArJHsoKGUudmFsdWUgYXMgbnVtYmVyIC0gMSkgKiAxMDApLnRvRml4ZWQoMCl9JSBIZWF0IENhcGFjaXR5YDtcbiAgICB9IGVsc2UgaWYgKGUudHlwZSA9PT0gJ2hlYXRfZWZmaWNpZW5jeScpIHtcbiAgICAgIHJldHVybiBgKyR7KChlLnZhbHVlIGFzIG51bWJlciAtIDEpICogMTAwKS50b0ZpeGVkKDApfSUgQ29vbGluZ2A7XG4gICAgfVxuICAgIHJldHVybiAnJztcbiAgfSkuam9pbignLCAnKSB8fCAnJztcblxuICBjb25zdCBjb3VudGRvd25IdG1sID0gbm9kZS5zdGF0dXMgPT09ICdpbl9wcm9ncmVzcydcbiAgICA/IGA8ZGl2IGNsYXNzPVwiY291bnRkb3duXCI+JHtmb3JtYXRUaW1lKG5vZGUucmVtYWluaW5nX3MpfTwvZGl2PmBcbiAgICA6ICcnO1xuXG4gIHJldHVybiBgXG4gICAgPGRpdiBjbGFzcz1cIm5vZGUgJHtzdGF0dXNDbGFzc31cIiBkYXRhLW5vZGUtaWQ9XCIke25vZGUuaWR9XCI+XG4gICAgICA8aDM+JHtub2RlLmxhYmVsfTwvaDM+XG4gICAgICAke2VmZmVjdHNIdG1sID8gYDxwIGNsYXNzPVwiZWZmZWN0c1wiPiR7ZWZmZWN0c0h0bWx9PC9wPmAgOiAnJ31cbiAgICAgIDxwIGNsYXNzPVwiZHVyYXRpb25cIj5EdXJhdGlvbjogJHtmb3JtYXRUaW1lKG5vZGUuZHVyYXRpb25fcyl9PC9wPlxuICAgICAgJHtjb3VudGRvd25IdG1sfVxuICAgICAgJHtub2RlLnN0YXR1cyA9PT0gJ2F2YWlsYWJsZScgPyAnPGJ1dHRvbj5TdGFydDwvYnV0dG9uPicgOiAnJ31cbiAgICAgICR7bm9kZS5zdGF0dXMgPT09ICdjb21wbGV0ZWQnID8gJzxkaXYgY2xhc3M9XCJjaGVja21hcmtcIj5cdTI3MTM8L2Rpdj4nIDogJyd9XG4gICAgPC9kaXY+XG4gIGA7XG59XG5cbmZ1bmN0aW9uIGZvcm1hdFRpbWUoc2Vjb25kczogbnVtYmVyKTogc3RyaW5nIHtcbiAgaWYgKHNlY29uZHMgPCA2MCkgcmV0dXJuIGAke01hdGguZmxvb3Ioc2Vjb25kcyl9c2A7XG4gIGlmIChzZWNvbmRzIDwgMzYwMCkgcmV0dXJuIGAke01hdGguZmxvb3Ioc2Vjb25kcyAvIDYwKX1tYDtcbiAgcmV0dXJuIGAke01hdGguZmxvb3Ioc2Vjb25kcyAvIDM2MDApfWggJHtNYXRoLmZsb29yKChzZWNvbmRzICUgMzYwMCkgLyA2MCl9bWA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdGFydENvdW50ZG93blRpbWVyKHN0YXRlOiBBcHBTdGF0ZSwgYnVzOiBFdmVudEJ1cyk6IHZvaWQge1xuICBpZiAoY291bnRkb3duSW50ZXJ2YWwpIHtcbiAgICBjbGVhckludGVydmFsKGNvdW50ZG93bkludGVydmFsKTtcbiAgfVxuXG4gIGNvdW50ZG93bkludGVydmFsID0gd2luZG93LnNldEludGVydmFsKCgpID0+IHtcbiAgICBjb25zdCB1cGdyYWRlTm9kZXMgPSBzdGF0ZS5kYWc/Lm5vZGVzLmZpbHRlcihuID0+XG4gICAgICBuLmtpbmQgPT09ICd1bml0JyAmJiBuLnN0YXR1cyA9PT0gJ2luX3Byb2dyZXNzJ1xuICAgICkgfHwgW107XG5cbiAgICB1cGdyYWRlTm9kZXMuZm9yRWFjaChub2RlID0+IHtcbiAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtbm9kZS1pZD1cIiR7bm9kZS5pZH1cIl0gLmNvdW50ZG93bmApO1xuICAgICAgaWYgKGVsICYmIG5vZGUucmVtYWluaW5nX3MgPiAwKSB7XG4gICAgICAgIGVsLnRleHRDb250ZW50ID0gZm9ybWF0VGltZShub2RlLnJlbWFpbmluZ19zKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIFVwZGF0ZSBiYWRnZSBjb3VudFxuICAgIGNvbnN0IGluUHJvZ3Jlc3NDb3VudCA9IHVwZ3JhZGVOb2Rlcy5sZW5ndGg7XG4gICAgYnVzLmVtaXQoXCJ1cGdyYWRlczpjb3VudFVwZGF0ZWRcIiwgeyBjb3VudDogaW5Qcm9ncmVzc0NvdW50IH0pO1xuICB9LCAxMDAwKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0b3BDb3VudGRvd25UaW1lcigpOiB2b2lkIHtcbiAgaWYgKGNvdW50ZG93bkludGVydmFsKSB7XG4gICAgY2xlYXJJbnRlcnZhbChjb3VudGRvd25JbnRlcnZhbCk7XG4gICAgY291bnRkb3duSW50ZXJ2YWwgPSBudWxsO1xuICB9XG59XG4iLCAiaW1wb3J0IHsgY3JlYXRlRXZlbnRCdXMgfSBmcm9tIFwiLi9idXNcIjtcbmltcG9ydCB7IGNyZWF0ZUluaXRpYWxTdGF0ZSB9IGZyb20gXCIuL3N0YXRlXCI7XG5pbXBvcnQgeyBpbml0VXBncmFkZXNQYW5lbCwgc3RhcnRDb3VudGRvd25UaW1lciB9IGZyb20gXCIuL3VwZ3JhZGVzXCI7XG5pbXBvcnQgeyBjb25uZWN0V2ViU29ja2V0IH0gZnJvbSBcIi4vbmV0XCI7XG5cbmNvbnN0IFNUT1JBR0VfS0VZID0gXCJsc2Q6Y2FsbHNpZ25cIjtcblxudHlwZSBNYXliZTxUPiA9IFQgfCBudWxsIHwgdW5kZWZpbmVkO1xuXG5sZXQgc2F2ZVN0YXR1c1RpbWVyOiBudW1iZXIgfCBudWxsID0gbnVsbDtcblxuY29uc3QgY2FsbFNpZ25JbnB1dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTElucHV0RWxlbWVudD4oXCIjY2FsbC1zaWduLWlucHV0XCIpO1xuY29uc3Qgc2F2ZVN0YXR1cyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2F2ZS1zdGF0dXNcIik7XG5jb25zdCBjYW1wYWlnbkJ1dHRvbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2FtcGFpZ24tYnV0dG9uXCIpO1xuY29uc3QgdHV0b3JpYWxCdXR0b24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInR1dG9yaWFsLWJ1dHRvblwiKTtcbmNvbnN0IGZyZWVwbGF5QnV0dG9uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJmcmVlcGxheS1idXR0b25cIik7XG5jb25zdCBtYXBTaXplU2VsZWN0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MU2VsZWN0RWxlbWVudD4oXCIjbWFwLXNpemUtc2VsZWN0XCIpO1xuY29uc3QgdXBncmFkZXNCdG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInVwZ3JhZGVzLWJ0blwiKTtcblxuLy8gSW5pdGlhbGl6ZSBzdGF0ZSBhbmQgYnVzIGZvciB1cGdyYWRlc1xuY29uc3QgYnVzID0gY3JlYXRlRXZlbnRCdXMoKTtcbmNvbnN0IHN0YXRlID0gY3JlYXRlSW5pdGlhbFN0YXRlKCk7XG5cbi8vIEluaXRpYWxpemUgdXBncmFkZXMgcGFuZWxcbmluaXRVcGdyYWRlc1BhbmVsKHN0YXRlLCBidXMpO1xuc3RhcnRDb3VudGRvd25UaW1lcihzdGF0ZSwgYnVzKTtcblxuLy8gSGFuZGxlIHVwZ3JhZGVzIGJ1dHRvblxudXBncmFkZXNCdG4/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gIGJ1cy5lbWl0KFwidXBncmFkZXM6dG9nZ2xlXCIpO1xufSk7XG5cbi8vIFVwZGF0ZSBiYWRnZSB3aXRoIGluLXByb2dyZXNzIGNvdW50XG5idXMub24oXCJ1cGdyYWRlczpjb3VudFVwZGF0ZWRcIiwgKHsgY291bnQgfSkgPT4ge1xuICBjb25zdCBiYWRnZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidXBncmFkZXMtYmFkZ2VcIik7XG4gIGlmIChiYWRnZSkge1xuICAgIGJhZGdlLnRleHRDb250ZW50ID0gY291bnQgPiAwID8gYFx1MjY5OVx1RkUwRiAke2NvdW50fWAgOiBcIlwiO1xuICAgIGJhZGdlLnN0eWxlLmRpc3BsYXkgPSBjb3VudCA+IDAgPyBcImlubGluZVwiIDogXCJub25lXCI7XG4gIH1cbn0pO1xuXG4vLyBDb25uZWN0IHRvIHNlcnZlciB0byBnZXQgREFHIHN0YXRlIChmb3IgbG9iYnkgcm9vbSlcbmNvbnN0IHVybFBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCk7XG5jb25zdCBsb2JieVJvb20gPSB1cmxQYXJhbXMuZ2V0KFwibG9iYnlSb29tXCIpIHx8IFwibG9iYnktc2hhcmVkXCI7XG5pZiAodHlwZW9mIFdlYlNvY2tldCAhPT0gXCJ1bmRlZmluZWRcIikge1xuICBjb25uZWN0V2ViU29ja2V0KHtcbiAgICByb29tOiBsb2JieVJvb20sXG4gICAgc3RhdGUsXG4gICAgYnVzLFxuICAgIG9uU3RhdGVVcGRhdGVkOiAoKSA9PiB7XG4gICAgICBidXMuZW1pdChcInN0YXRlOnVwZGF0ZWRcIik7XG4gICAgfSxcbiAgfSk7XG59XG5cbmJvb3RzdHJhcCgpO1xuXG5mdW5jdGlvbiBib290c3RyYXAoKTogdm9pZCB7XG4gIGNvbnN0IGluaXRpYWxOYW1lID0gcmVzb2x2ZUluaXRpYWxDYWxsU2lnbigpO1xuICBpZiAoY2FsbFNpZ25JbnB1dCkge1xuICAgIGNhbGxTaWduSW5wdXQudmFsdWUgPSBpbml0aWFsTmFtZTtcbiAgfVxuXG4gIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2FsbC1zaWduLWZvcm1cIik/LmFkZEV2ZW50TGlzdGVuZXIoXCJzdWJtaXRcIiwgKGV2ZW50KSA9PiB7XG4gICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICBjb25zdCBuYW1lID0gZW5zdXJlQ2FsbFNpZ24oKTtcbiAgICBpZiAobmFtZSkge1xuICAgICAgc2hvd1NhdmVTdGF0dXMoXCJTYXZlZCBjYWxsIHNpZ25cIik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNob3dTYXZlU3RhdHVzKFwiQ2xlYXJlZCBjYWxsIHNpZ25cIik7XG4gICAgfVxuICB9KTtcblxuICBjYW1wYWlnbkJ1dHRvbj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICBjb25zdCBuYW1lID0gZW5zdXJlQ2FsbFNpZ24oKTtcbiAgICBjb25zdCByb29tSWQgPSBnZW5lcmF0ZVJvb21JZChcImNhbXBhaWduXCIpO1xuICAgIGNvbnN0IG1pc3Npb25JZCA9IFwiMVwiO1xuICAgIGNvbnN0IHVybCA9IGJ1aWxkUm9vbVVybChcbiAgICAgIHJvb21JZCxcbiAgICAgIG5hbWUsXG4gICAgICBcImNhbXBhaWduXCIsXG4gICAgICB7IHc6IDMyMDAwLCBoOiAxODAwMCB9LFxuICAgICAgbWlzc2lvbklkLFxuICAgICk7XG4gICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB1cmw7XG4gIH0pO1xuXG4gIHR1dG9yaWFsQnV0dG9uPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIGNvbnN0IG5hbWUgPSBlbnN1cmVDYWxsU2lnbigpO1xuICAgIGNvbnN0IG1hcFNpemUgPSBnZXRTZWxlY3RlZE1hcFNpemUoKTtcbiAgICBjb25zdCByb29tSWQgPSBnZW5lcmF0ZVJvb21JZChcInR1dG9yaWFsXCIpO1xuICAgIGNvbnN0IHVybCA9IGJ1aWxkUm9vbVVybChyb29tSWQsIG5hbWUsIFwidHV0b3JpYWxcIiwgbWFwU2l6ZSk7XG4gICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB1cmw7XG4gIH0pO1xuXG4gIGZyZWVwbGF5QnV0dG9uPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIGNvbnN0IG5hbWUgPSBlbnN1cmVDYWxsU2lnbigpO1xuICAgIGNvbnN0IG1hcFNpemUgPSBnZXRTZWxlY3RlZE1hcFNpemUoKTtcbiAgICBjb25zdCByb29tSWQgPSBnZW5lcmF0ZVJvb21JZChcImZyZWVwbGF5XCIpO1xuICAgIGNvbnN0IHVybCA9IGJ1aWxkUm9vbVVybChyb29tSWQsIG5hbWUsIFwiZnJlZXBsYXlcIiwgbWFwU2l6ZSk7XG4gICAgd2luZG93LmxvY2F0aW9uLmhyZWYgPSB1cmw7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBnZXRTZWxlY3RlZE1hcFNpemUoKTogeyB3OiBudW1iZXI7IGg6IG51bWJlciB9IHtcbiAgY29uc3Qgc2VsZWN0ZWQgPSBtYXBTaXplU2VsZWN0Py52YWx1ZSB8fCBcIm1lZGl1bVwiO1xuICBzd2l0Y2ggKHNlbGVjdGVkKSB7XG4gICAgY2FzZSBcInNtYWxsXCI6XG4gICAgICByZXR1cm4geyB3OiA0MDAwLCBoOiAyMjUwIH07XG4gICAgY2FzZSBcIm1lZGl1bVwiOlxuICAgICAgcmV0dXJuIHsgdzogODAwMCwgaDogNDUwMCB9O1xuICAgIGNhc2UgXCJsYXJnZVwiOlxuICAgICAgcmV0dXJuIHsgdzogMTYwMDAsIGg6IDkwMDAgfTtcbiAgICBjYXNlIFwiaHVnZVwiOlxuICAgICAgcmV0dXJuIHsgdzogMzIwMDAsIGg6IDE4MDAwIH07XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB7IHc6IDgwMDAsIGg6IDQ1MDAgfTtcbiAgfVxufVxuXG5mdW5jdGlvbiBlbnN1cmVDYWxsU2lnbigpOiBzdHJpbmcge1xuICBjb25zdCBpbnB1dE5hbWUgPSBjYWxsU2lnbklucHV0ID8gY2FsbFNpZ25JbnB1dC52YWx1ZSA6IFwiXCI7XG4gIGNvbnN0IHNhbml0aXplZCA9IHNhbml0aXplQ2FsbFNpZ24oaW5wdXROYW1lKTtcbiAgaWYgKGNhbGxTaWduSW5wdXQpIHtcbiAgICBjYWxsU2lnbklucHV0LnZhbHVlID0gc2FuaXRpemVkO1xuICB9XG4gIHBlcnNpc3RDYWxsU2lnbihzYW5pdGl6ZWQpO1xuICByZXR1cm4gc2FuaXRpemVkO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlSW5pdGlhbENhbGxTaWduKCk6IHN0cmluZyB7XG4gIGNvbnN0IGZyb21RdWVyeSA9IHNhbml0aXplQ2FsbFNpZ24obmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKS5nZXQoXCJuYW1lXCIpKTtcbiAgY29uc3Qgc3RvcmVkID0gc2FuaXRpemVDYWxsU2lnbihyZWFkU3RvcmVkQ2FsbFNpZ24oKSk7XG4gIGlmIChmcm9tUXVlcnkpIHtcbiAgICBpZiAoZnJvbVF1ZXJ5ICE9PSBzdG9yZWQpIHtcbiAgICAgIHBlcnNpc3RDYWxsU2lnbihmcm9tUXVlcnkpO1xuICAgIH1cbiAgICByZXR1cm4gZnJvbVF1ZXJ5O1xuICB9XG4gIHJldHVybiBzdG9yZWQ7XG59XG5cbmZ1bmN0aW9uIHNhbml0aXplQ2FsbFNpZ24odmFsdWU6IE1heWJlPHN0cmluZz4pOiBzdHJpbmcge1xuICBpZiAoIXZhbHVlKSB7XG4gICAgcmV0dXJuIFwiXCI7XG4gIH1cbiAgY29uc3QgdHJpbW1lZCA9IHZhbHVlLnRyaW0oKTtcbiAgaWYgKCF0cmltbWVkKSB7XG4gICAgcmV0dXJuIFwiXCI7XG4gIH1cbiAgcmV0dXJuIHRyaW1tZWQuc2xpY2UoMCwgMjQpO1xufVxuXG5mdW5jdGlvbiBwZXJzaXN0Q2FsbFNpZ24obmFtZTogc3RyaW5nKTogdm9pZCB7XG4gIHRyeSB7XG4gICAgaWYgKG5hbWUpIHtcbiAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbShTVE9SQUdFX0tFWSwgbmFtZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbShTVE9SQUdFX0tFWSk7XG4gICAgfVxuICB9IGNhdGNoIHtcbiAgICAvKiBsb2NhbFN0b3JhZ2UgdW5hdmFpbGFibGU7IGlnbm9yZSAqL1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlYWRTdG9yZWRDYWxsU2lnbigpOiBzdHJpbmcge1xuICB0cnkge1xuICAgIHJldHVybiB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oU1RPUkFHRV9LRVkpID8/IFwiXCI7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBcIlwiO1xuICB9XG59XG5cbmZ1bmN0aW9uIGJ1aWxkUm9vbVVybChcbiAgcm9vbUlkOiBzdHJpbmcsXG4gIGNhbGxTaWduOiBzdHJpbmcsXG4gIG1vZGU/OiBzdHJpbmcsXG4gIG1hcFNpemU/OiB7IHc6IG51bWJlcjsgaDogbnVtYmVyIH0sXG4gIG1pc3Npb25JZD86IHN0cmluZyxcbik6IHN0cmluZyB7XG4gIGxldCB1cmwgPSBgJHt3aW5kb3cubG9jYXRpb24ub3JpZ2lufS8/cm9vbT0ke2VuY29kZVVSSUNvbXBvbmVudChyb29tSWQpfWA7XG4gIGlmIChtb2RlKSB7XG4gICAgdXJsICs9IGAmbW9kZT0ke2VuY29kZVVSSUNvbXBvbmVudChtb2RlKX1gO1xuICB9XG4gIGlmIChtaXNzaW9uSWQpIHtcbiAgICB1cmwgKz0gYCZtaXNzaW9uPSR7ZW5jb2RlVVJJQ29tcG9uZW50KG1pc3Npb25JZCl9YDtcbiAgfVxuICBpZiAoY2FsbFNpZ24pIHtcbiAgICB1cmwgKz0gYCZuYW1lPSR7ZW5jb2RlVVJJQ29tcG9uZW50KGNhbGxTaWduKX1gO1xuICB9XG4gIGlmIChtYXBTaXplKSB7XG4gICAgdXJsICs9IGAmbWFwVz0ke21hcFNpemUud30mbWFwSD0ke21hcFNpemUuaH1gO1xuICB9XG4gIHJldHVybiB1cmw7XG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlUm9vbUlkKHByZWZpeD86IHN0cmluZyk6IHN0cmluZyB7XG4gIGxldCBzbHVnID0gXCJcIjtcbiAgd2hpbGUgKHNsdWcubGVuZ3RoIDwgNikge1xuICAgIHNsdWcgPSBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyLCA4KTtcbiAgfVxuICBpZiAocHJlZml4KSB7XG4gICAgcmV0dXJuIGAke3ByZWZpeH0tJHtzbHVnfWA7XG4gIH1cbiAgcmV0dXJuIGByLSR7c2x1Z31gO1xufVxuXG5mdW5jdGlvbiBzaG93U2F2ZVN0YXR1cyhtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcbiAgaWYgKCFzYXZlU3RhdHVzKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHNhdmVTdGF0dXMudGV4dENvbnRlbnQgPSBtZXNzYWdlO1xuICBpZiAoc2F2ZVN0YXR1c1RpbWVyICE9PSBudWxsKSB7XG4gICAgd2luZG93LmNsZWFyVGltZW91dChzYXZlU3RhdHVzVGltZXIpO1xuICB9XG4gIHNhdmVTdGF0dXNUaW1lciA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHtcbiAgICBpZiAoc2F2ZVN0YXR1cykge1xuICAgICAgc2F2ZVN0YXR1cy50ZXh0Q29udGVudCA9IFwiXCI7XG4gICAgfVxuICAgIHNhdmVTdGF0dXNUaW1lciA9IG51bGw7XG4gIH0sIDIwMDApO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUE4Rk8sV0FBUyxpQkFBMkI7QUFDekMsVUFBTSxXQUFXLG9CQUFJLElBQTZCO0FBQ2xELFdBQU87QUFBQSxNQUNMLEdBQUcsT0FBTyxTQUFTO0FBQ2pCLFlBQUksTUFBTSxTQUFTLElBQUksS0FBSztBQUM1QixZQUFJLENBQUMsS0FBSztBQUNSLGdCQUFNLG9CQUFJLElBQUk7QUFDZCxtQkFBUyxJQUFJLE9BQU8sR0FBRztBQUFBLFFBQ3pCO0FBQ0EsWUFBSSxJQUFJLE9BQU87QUFDZixlQUFPLE1BQU0sSUFBSyxPQUFPLE9BQU87QUFBQSxNQUNsQztBQUFBLE1BQ0EsS0FBSyxPQUFpQixTQUFtQjtBQUN2QyxjQUFNLE1BQU0sU0FBUyxJQUFJLEtBQUs7QUFDOUIsWUFBSSxDQUFDLE9BQU8sSUFBSSxTQUFTLEVBQUc7QUFDNUIsbUJBQVcsTUFBTSxLQUFLO0FBQ3BCLGNBQUk7QUFDRixZQUFDLEdBQWlDLE9BQU87QUFBQSxVQUMzQyxTQUFTLEtBQUs7QUFDWixvQkFBUSxNQUFNLHFCQUFxQixLQUFLLFdBQVcsR0FBRztBQUFBLFVBQ3hE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QUUsR0FBRyxFQUFFLFFBQVEsZUFBZSxVQUFVLEVBQUUsR0FBRyxFQUFFLFFBQVEsY0FBYyxVQUFVLEVBQUUsR0FBRyxFQUFFLFFBQVEsZ0JBQWdCLFVBQVUsRUFBRSxHQUFHLEVBQUUsUUFBUSxnQkFBZ0IsVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLGFBQWEsVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLGVBQWUsVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLGNBQWMsVUFBVSxHQUFHLEdBQUcsRUFBRSxRQUFRLGdCQUFnQixVQUFVLEdBQUcsR0FBRyxFQUFFLFFBQVEsY0FBYyxVQUFVLEdBQUcsR0FBRyxFQUFFLFFBQVEsZUFBZSxVQUFVLEdBQUcsR0FBRyxFQUFFLFFBQVEsYUFBYSxVQUFVLEdBQUcsR0FBRyxFQUFFLFFBQVEsaUJBQWlCLFVBQVUsR0FBRyxHQUFHLEVBQUUsUUFBUSxpQkFBaUIsVUFBVSxHQUFHLEdBQUcsRUFBRSxRQUFRLGVBQWUsVUFBVSxHQUFHLEdBQUcsRUFBRSxRQUFRLGVBQWUsVUFBVSxHQUFHLENBQUMsRUFBRSxHQUFHLEVBQUUsUUFBUSxTQUFTLFNBQVMsQ0FBQyxFQUFFLFFBQVEsa0JBQWtCLFVBQVUsRUFBRSxHQUFHLEVBQUUsUUFBUSxrQkFBa0IsVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLGtCQUFrQixVQUFVLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsUUFBUSx3QkFBd0IsU0FBUyxDQUFDLEVBQUUsUUFBUSxRQUFRLFVBQVUsR0FBRyxRQUFRLEdBQUcsU0FBUyxFQUFFLEdBQUcsRUFBRSxRQUFRLFdBQVcsVUFBVSxHQUFHLFFBQVEsSUFBSSxTQUFTLEdBQUcsWUFBWSxnQ0FBZ0MsQ0FBQyxFQUFFLEdBQUcsRUFBRSxRQUFRLHVCQUF1QixTQUFTLENBQUMsRUFBRSxRQUFRLFFBQVEsVUFBVSxHQUFHLFFBQVEsR0FBRyxTQUFTLEVBQUUsR0FBRyxFQUFFLFFBQVEsU0FBUyxVQUFVLEdBQUcsUUFBUSxJQUFJLFNBQVMsR0FBRyxZQUFZLDRDQUE0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R0FBRyxFQUFFLFFBQVEsbUJBQW1CLFVBQVUsR0FBRyxRQUFRLElBQUksU0FBUyxHQUFHLFlBQVksMkJBQTJCLENBQUMsRUFBRSxDQUFDLEdBQUcsWUFBWSxDQUFDLEVBQUUsUUFBUSxTQUFTLFNBQVMsQ0FBQyxFQUFFLFFBQVEsVUFBVSxVQUFVLEVBQUUsR0FBRyxFQUFFLFFBQVEsUUFBUSxVQUFVLEVBQUUsR0FBRyxFQUFFLFFBQVEsZ0JBQWdCLFVBQVUsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLFFBQVEsVUFBVSxTQUFTLENBQUMsRUFBRSxRQUFRLGFBQWEsVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLGFBQWEsVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLGFBQWEsVUFBVSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsUUFBUSxtQkFBbUIsU0FBUyxDQUFDLEVBQUUsUUFBUSxxQkFBcUIsVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLHFCQUFxQixVQUFVLEVBQUUsR0FBRyxFQUFFLFFBQVEsb0JBQW9CLFVBQVUsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLFFBQVEsb0JBQW9CLFNBQVMsQ0FBQyxFQUFFLFFBQVEsdUJBQXVCLFVBQVUsRUFBRSxHQUFHLEVBQUUsUUFBUSxvQkFBb0IsVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLCtCQUErQixVQUFVLEVBQUUsR0FBRyxFQUFFLFFBQVEsdUJBQXVCLFVBQVUsRUFBRSxHQUFHLEVBQUUsUUFBUSxxQkFBcUIsVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLHFCQUFxQixVQUFVLEVBQUUsR0FBRyxFQUFFLFFBQVEsb0JBQW9CLFVBQVUsRUFBRSxHQUFHLEVBQUUsUUFBUSwwQkFBMEIsVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLHVCQUF1QixVQUFVLEVBQUUsR0FBRyxFQUFFLFFBQVEsc0JBQXNCLFVBQVUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxHQUFHLGtCQUFrQixDQUFDLEVBQUUsU0FBUyxLQUFNLE9BQU8sVUFBVSxDQUFDLEVBQUUsR0FBRyxFQUFFLFFB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QUksWUFBWTtBQUNkLHVCQUFXLGNBQWM7QUFBQSxVQUMzQjtBQUNBLDRCQUFrQjtBQUFBLFFBQ3BCLEdBQUcsR0FBSTtBQUFBLE1BQ1Q7QUFBQTtBQUFBOyIsCiAgIm5hbWVzIjogWyJpc01lc3NhZ2UiLCAiU2NhbGFyVHlwZSIsICJtZXNzYWdlRGVzYyIsICJtZXNzYWdlRGVzYyIsICJtZXNzYWdlRGVzYyIsICJJTVBMSUNJVCIsICJXaXJlVHlwZSIsICJtZXNzYWdlRGVzYyIsICJfYSIsICJFRElUSU9OX1BST1RPMiIsICJFRElUSU9OX1BST1RPMyIsICJJTVBMSUNJVCIsICJib290IiwgIkV4dGVuc2lvblJhbmdlT3B0aW9uc19WZXJpZmljYXRpb25TdGF0ZSIsICJGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlIiwgIkZpZWxkRGVzY3JpcHRvclByb3RvX0xhYmVsIiwgIkZpbGVPcHRpb25zX09wdGltaXplTW9kZSIsICJGaWVsZE9wdGlvbnNfQ1R5cGUiLCAiRmllbGRPcHRpb25zX0pTVHlwZSIsICJGaWVsZE9wdGlvbnNfT3B0aW9uUmV0ZW50aW9uIiwgIkZpZWxkT3B0aW9uc19PcHRpb25UYXJnZXRUeXBlIiwgIk1ldGhvZE9wdGlvbnNfSWRlbXBvdGVuY3lMZXZlbCIsICJGZWF0dXJlU2V0X1Zpc2liaWxpdHlGZWF0dXJlX0RlZmF1bHRTeW1ib2xWaXNpYmlsaXR5IiwgIkZlYXR1cmVTZXRfRmllbGRQcmVzZW5jZSIsICJGZWF0dXJlU2V0X0VudW1UeXBlIiwgIkZlYXR1cmVTZXRfUmVwZWF0ZWRGaWVsZEVuY29kaW5nIiwgIkZlYXR1cmVTZXRfVXRmOFZhbGlkYXRpb24iLCAiRmVhdHVyZVNldF9NZXNzYWdlRW5jb2RpbmciLCAiRmVhdHVyZVNldF9Kc29uRm9ybWF0IiwgIkZlYXR1cmVTZXRfRW5mb3JjZU5hbWluZ1N0eWxlIiwgIkdlbmVyYXRlZENvZGVJbmZvX0Fubm90YXRpb25fU2VtYW50aWMiLCAiRWRpdGlvbiIsICJTeW1ib2xWaXNpYmlsaXR5IiwgIkxFR0FDWV9SRVFVSVJFRCIsICJpbml0X3NjYWxhciIsICJpbml0X3R5cGVzIiwgImluaXRfc2NhbGFyIiwgImluaXRfdHlwZXMiXQp9Cg==
