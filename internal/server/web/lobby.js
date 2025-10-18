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
        return EDITION_PROTO2;
      case "proto3":
        return EDITION_PROTO3;
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
      return IMPLICIT2;
    }
    if (!!oneof || proto.proto3Optional) {
      return EXPLICIT;
    }
    if (isExtension) {
      return EXPLICIT;
    }
    const resolved = resolveFeature("fieldPresence", { proto, parent });
    if (resolved == IMPLICIT2 && (proto.type == TYPE_MESSAGE || proto.type == TYPE_GROUP)) {
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
  var EDITION_PROTO2, EDITION_PROTO3, TYPE_STRING, TYPE_GROUP, TYPE_MESSAGE, TYPE_BYTES, TYPE_ENUM, LABEL_REPEATED, LABEL_REQUIRED, JS_STRING, IDEMPOTENCY_UNKNOWN, EXPLICIT, IMPLICIT2, LEGACY_REQUIRED, PACKED, DELIMITED, OPEN, featureDefaults;
  var init_registry = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/registry.js"() {
      init_descriptors();
      init_text_format();
      init_nested_types();
      init_unsafe();
      init_names();
      EDITION_PROTO2 = 998;
      EDITION_PROTO3 = 999;
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
      IMPLICIT2 = 2;
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

  // web/node_modules/@bufbuild/protobuf/dist/esm/fields.js
  var init_fields = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/fields.js"() {
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
        if (member.kind == "oneof" || member.presence == IMPLICIT3) {
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
          if (member.presence == IMPLICIT3) {
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
            if (member.presence != IMPLICIT3) {
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
      case EDITION_PROTO32:
        return false;
      case EDITION_PROTO22:
        return true;
      default:
        return desc.fields.some((f) => f.presence != IMPLICIT3 && f.fieldKind != "message" && !f.oneof);
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
  var EDITION_PROTO32, EDITION_PROTO22, IMPLICIT3, tokenZeroMessageField, messagePrototypes;
  var init_create = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/create.js"() {
      init_is_message();
      init_descriptors();
      init_scalar();
      init_guard();
      init_unsafe();
      init_wrappers();
      EDITION_PROTO32 = 999;
      EDITION_PROTO22 = 998;
      IMPLICIT3 = 2;
      tokenZeroMessageField = Symbol();
      messagePrototypes = /* @__PURE__ */ new WeakMap();
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

  // web/node_modules/@bufbuild/protobuf/dist/esm/clone.js
  var init_clone = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/clone.js"() {
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

  // web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/embed.js
  var init_embed = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/embed.js"() {
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/extension.js
  var init_extension = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/codegenv2/extension.js"() {
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
  var init_types = __esm({
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
      init_types();
    }
  });

  // web/src/proto/proto/ws_messages_pb.ts
  var file_proto_ws_messages, WsEnvelopeSchema;
  var init_ws_messages_pb = __esm({
    "web/src/proto/proto/ws_messages_pb.ts"() {
      "use strict";
      init_codegenv2();
      file_proto_ws_messages = /* @__PURE__ */ fileDesc("Chdwcm90by93c19tZXNzYWdlcy5wcm90bxIRbGlnaHRzcGVlZGR1ZWwud3MiwA0KCldzRW52ZWxvcGUSNgoMc3RhdGVfdXBkYXRlGAEgASgLMh4ubGlnaHRzcGVlZGR1ZWwud3MuU3RhdGVVcGRhdGVIABI1Cglyb29tX2Z1bGwYAiABKAsyIC5saWdodHNwZWVkZHVlbC53cy5Sb29tRnVsbEVycm9ySAASLQoEam9pbhgKIAEoCzIdLmxpZ2h0c3BlZWRkdWVsLndzLkNsaWVudEpvaW5IABIwCglzcGF3bl9ib3QYCyABKAsyGy5saWdodHNwZWVkZHVlbC53cy5TcGF3bkJvdEgAEjYKDGFkZF93YXlwb2ludBgMIAEoCzIeLmxpZ2h0c3BlZWRkdWVsLndzLkFkZFdheXBvaW50SAASPAoPdXBkYXRlX3dheXBvaW50GA0gASgLMiEubGlnaHRzcGVlZGR1ZWwud3MuVXBkYXRlV2F5cG9pbnRIABI4Cg1tb3ZlX3dheXBvaW50GA4gASgLMh8ubGlnaHRzcGVlZGR1ZWwud3MuTW92ZVdheXBvaW50SAASPAoPZGVsZXRlX3dheXBvaW50GA8gASgLMiEubGlnaHRzcGVlZGR1ZWwud3MuRGVsZXRlV2F5cG9pbnRIABI8Cg9jbGVhcl93YXlwb2ludHMYECABKAsyIS5saWdodHNwZWVkZHVlbC53cy5DbGVhcldheXBvaW50c0gAEkAKEWNvbmZpZ3VyZV9taXNzaWxlGBEgASgLMiMubGlnaHRzcGVlZGR1ZWwud3MuQ29uZmlndXJlTWlzc2lsZUgAEkUKFGFkZF9taXNzaWxlX3dheXBvaW50GBIgASgLMiUubGlnaHRzcGVlZGR1ZWwud3MuQWRkTWlzc2lsZVdheXBvaW50SAASVgoddXBkYXRlX21pc3NpbGVfd2F5cG9pbnRfc3BlZWQYEyABKAsyLS5saWdodHNwZWVkZHVlbC53cy5VcGRhdGVNaXNzaWxlV2F5cG9pbnRTcGVlZEgAEkcKFW1vdmVfbWlzc2lsZV93YXlwb2ludBgUIAEoCzImLmxpZ2h0c3BlZWRkdWVsLndzLk1vdmVNaXNzaWxlV2F5cG9pbnRIABJLChdkZWxldGVfbWlzc2lsZV93YXlwb2ludBgVIAEoCzIoLmxpZ2h0c3BlZWRkdWVsLndzLkRlbGV0ZU1pc3NpbGVXYXlwb2ludEgAEkMKE2NsZWFyX21pc3NpbGVfcm91dGUYFiABKAsyJC5saWdodHNwZWVkZHVlbC53cy5DbGVhck1pc3NpbGVSb3V0ZUgAEj8KEWFkZF9taXNzaWxlX3JvdXRlGBcgASgLMiIubGlnaHRzcGVlZGR1ZWwud3MuQWRkTWlzc2lsZVJvdXRlSAASRQoUcmVuYW1lX21pc3NpbGVfcm91dGUYGCABKAsyJS5saWdodHNwZWVkZHVlbC53cy5SZW5hbWVNaXNzaWxlUm91dGVIABJFChRkZWxldGVfbWlzc2lsZV9yb3V0ZRgZIAEoCzIlLmxpZ2h0c3BlZWRkdWVsLndzLkRlbGV0ZU1pc3NpbGVSb3V0ZUgAEkwKGHNldF9hY3RpdmVfbWlzc2lsZV9yb3V0ZRgaIAEoCzIoLmxpZ2h0c3BlZWRkdWVsLndzLlNldEFjdGl2ZU1pc3NpbGVSb3V0ZUgAEjoKDmxhdW5jaF9taXNzaWxlGBsgASgLMiAubGlnaHRzcGVlZGR1ZWwud3MuTGF1bmNoTWlzc2lsZUgAEjAKCWRhZ19zdGFydBgeIAEoCzIbLmxpZ2h0c3BlZWRkdWVsLndzLkRhZ1N0YXJ0SAASMgoKZGFnX2NhbmNlbBgfIAEoCzIcLmxpZ2h0c3BlZWRkdWVsLndzLkRhZ0NhbmNlbEgAEjcKDWRhZ19zdG9yeV9hY2sYICABKAsyHi5saWdodHNwZWVkZHVlbC53cy5EYWdTdG9yeUFja0gAEi4KCGRhZ19saXN0GCEgASgLMhoubGlnaHRzcGVlZGR1ZWwud3MuRGFnTGlzdEgAEkEKEm1pc3Npb25fc3Bhd25fd2F2ZRgoIAEoCzIjLmxpZ2h0c3BlZWRkdWVsLndzLk1pc3Npb25TcGF3bldhdmVIABJDChNtaXNzaW9uX3N0b3J5X2V2ZW50GCkgASgLMiQubGlnaHRzcGVlZGR1ZWwud3MuTWlzc2lvblN0b3J5RXZlbnRIABI/ChFkYWdfbGlzdF9yZXNwb25zZRgyIAEoCzIiLmxpZ2h0c3BlZWRkdWVsLndzLkRhZ0xpc3RSZXNwb25zZUgAQgkKB3BheWxvYWQiswUKC1N0YXRlVXBkYXRlEgsKA25vdxgBIAEoARIkCgJtZRgCIAEoCzIYLmxpZ2h0c3BlZWRkdWVsLndzLkdob3N0EigKBmdob3N0cxgDIAMoCzIYLmxpZ2h0c3BlZWRkdWVsLndzLkdob3N0EikKBG1ldGEYBCABKAsyGy5saWdodHNwZWVkZHVlbC53cy5Sb29tTWV0YRIsCghtaXNzaWxlcxgFIAMoCzIaLmxpZ2h0c3BlZWRkdWVsLndzLk1pc3NpbGUSOAoObWlzc2lsZV9jb25maWcYBiABKAsyIC5saWdodHNwZWVkZHVlbC53cy5NaXNzaWxlQ29uZmlnEjYKEW1pc3NpbGVfd2F5cG9pbnRzGAcgAygLMhsubGlnaHRzcGVlZGR1ZWwud3MuV2F5cG9pbnQSNwoObWlzc2lsZV9yb3V0ZXMYCCADKAsyHy5saWdodHNwZWVkZHVlbC53cy5NaXNzaWxlUm91dGUSHAoUYWN0aXZlX21pc3NpbGVfcm91dGUYCSABKAkSGgoSbmV4dF9taXNzaWxlX3JlYWR5GAogASgBEi0KA2RhZxgLIAEoCzIbLmxpZ2h0c3BlZWRkdWVsLndzLkRhZ1N0YXRlSACIAQESNAoJaW52ZW50b3J5GAwgASgLMhwubGlnaHRzcGVlZGR1ZWwud3MuSW52ZW50b3J5SAGIAQESMQoFc3RvcnkYDSABKAsyHS5saWdodHNwZWVkZHVlbC53cy5TdG9yeVN0YXRlSAKIAQESQAoMY2FwYWJpbGl0aWVzGA4gASgLMiUubGlnaHRzcGVlZGR1ZWwud3MuUGxheWVyQ2FwYWJpbGl0aWVzSAOIAQFCBgoEX2RhZ0IMCgpfaW52ZW50b3J5QggKBl9zdG9yeUIPCg1fY2FwYWJpbGl0aWVzIiAKDVJvb21GdWxsRXJyb3ISDwoHbWVzc2FnZRgBIAEoCSJGCgpDbGllbnRKb2luEgwKBG5hbWUYASABKAkSDAoEcm9vbRgCIAEoCRINCgVtYXBfdxgDIAEoARINCgVtYXBfaBgEIAEoASIKCghTcGF3bkJvdCIyCgtBZGRXYXlwb2ludBIJCgF4GAEgASgBEgkKAXkYAiABKAESDQoFc3BlZWQYAyABKAEiLgoOVXBkYXRlV2F5cG9pbnQSDQoFaW5kZXgYASABKAUSDQoFc3BlZWQYAiABKAEiMwoMTW92ZVdheXBvaW50Eg0KBWluZGV4GAEgASgFEgkKAXgYAiABKAESCQoBeRgDIAEoASIfCg5EZWxldGVXYXlwb2ludBINCgVpbmRleBgBIAEoBSIQCg5DbGVhcldheXBvaW50cyI/ChBDb25maWd1cmVNaXNzaWxlEhUKDW1pc3NpbGVfc3BlZWQYASABKAESFAoMbWlzc2lsZV9hZ3JvGAIgASgBIksKEkFkZE1pc3NpbGVXYXlwb2ludBIQCghyb3V0ZV9pZBgBIAEoCRIJCgF4GAIgASgBEgkKAXkYAyABKAESDQoFc3BlZWQYBCABKAEiTAoaVXBkYXRlTWlzc2lsZVdheXBvaW50U3BlZWQSEAoIcm91dGVfaWQYASABKAkSDQoFaW5kZXgYAiABKAUSDQoFc3BlZWQYAyABKAEiTAoTTW92ZU1pc3NpbGVXYXlwb2ludBIQCghyb3V0ZV9pZBgBIAEoCRINCgVpbmRleBgCIAEoBRIJCgF4GAMgASgBEgkKAXkYBCABKAEiOAoVRGVsZXRlTWlzc2lsZVdheXBvaW50EhAKCHJvdXRlX2lkGAEgASgJEg0KBWluZGV4GAIgASgFIiUKEUNsZWFyTWlzc2lsZVJvdXRlEhAKCHJvdXRlX2lkGAEgASgJIh8KD0FkZE1pc3NpbGVSb3V0ZRIMCgRuYW1lGAEgASgJIjQKElJlbmFtZU1pc3NpbGVSb3V0ZRIQCghyb3V0ZV9pZBgBIAEoCRIMCgRuYW1lGAIgASgJIiYKEkRlbGV0ZU1pc3NpbGVSb3V0ZRIQCghyb3V0ZV9pZBgBIAEoCSIpChVTZXRBY3RpdmVNaXNzaWxlUm91dGUSEAoIcm91dGVfaWQYASABKAkiIQoNTGF1bmNoTWlzc2lsZRIQCghyb3V0ZV9pZBgBIAEoCSKCAgoFR2hvc3QSCgoCaWQYASABKAkSCQoBeBgCIAEoARIJCgF5GAMgASgBEgoKAnZ4GAQgASgBEgoKAnZ5GAUgASgBEgkKAXQYBiABKAESDAoEc2VsZhgHIAEoCBIuCgl3YXlwb2ludHMYCCADKAsyGy5saWdodHNwZWVkZHVlbC53cy5XYXlwb2ludBIeChZjdXJyZW50X3dheXBvaW50X2luZGV4GAkgASgFEgoKAmhwGAogASgFEg0KBWtpbGxzGAsgASgFEjIKBGhlYXQYDCABKAsyHy5saWdodHNwZWVkZHVlbC53cy5TaGlwSGVhdFZpZXdIAIgBAUIHCgVfaGVhdCIvCghXYXlwb2ludBIJCgF4GAEgASgBEgkKAXkYAiABKAESDQoFc3BlZWQYAyABKAEiKwoIUm9vbU1ldGESCQoBYxgBIAEoARIJCgF3GAIgASgBEgkKAWgYAyABKAEiiwIKB01pc3NpbGUSCgoCaWQYASABKAkSDQoFb3duZXIYAiABKAkSDAoEc2VsZhgDIAEoCBIJCgF4GAQgASgBEgkKAXkYBSABKAESCgoCdngYBiABKAESCgoCdnkYByABKAESCQoBdBgIIAEoARITCgthZ3JvX3JhZGl1cxgJIAEoARIQCghsaWZldGltZRgKIAEoARITCgtsYXVuY2hfdGltZRgLIAEoARISCgpleHBpcmVzX2F0GAwgASgBEhEKCXRhcmdldF9pZBgNIAEoCRIyCgRoZWF0GA4gASgLMh8ubGlnaHRzcGVlZGR1ZWwud3MuU2hpcEhlYXRWaWV3SACIAQFCBwoFX2hlYXQixgEKDU1pc3NpbGVDb25maWcSDQoFc3BlZWQYASABKAESEQoJc3BlZWRfbWluGAIgASgBEhEKCXNwZWVkX21heBgDIAEoARIQCghhZ3JvX21pbhgEIAEoARITCgthZ3JvX3JhZGl1cxgFIAEoARIQCghsaWZldGltZRgGIAEoARI3CgtoZWF0X2NvbmZpZxgHIAEoCzIdLmxpZ2h0c3BlZWRkdWVsLndzLkhlYXRQYXJhbXNIAIgBAUIOCgxfaGVhdF9jb25maWciWAoMTWlzc2lsZVJvdXRlEgoKAmlkGAEgASgJEgwKBG5hbWUYAiABKAkSLgoJd2F5cG9pbnRzGAMgAygLMhsubGlnaHRzcGVlZGR1ZWwud3MuV2F5cG9pbnQidgoMU2hpcEhlYXRWaWV3EgkKAXYYASABKAESCQoBbRgCIAEoARIJCgF3GAMgASgBEgkKAW8YBCABKAESCgoCbXMYBSABKAESCgoCc3UYBiABKAESCgoCa3UYByABKAESCgoCa2QYCCABKAESCgoCZXgYCSABKAEigAEKCkhlYXRQYXJhbXMSCwoDbWF4GAEgASgBEg8KB3dhcm5fYXQYAiABKAESEwoLb3ZlcmhlYXRfYXQYAyABKAESFAoMbWFya2VyX3NwZWVkGAQgASgBEgwKBGtfdXAYBSABKAESDgoGa19kb3duGAYgASgBEgsKA2V4cBgHIAEoASJ3Cg1VcGdyYWRlRWZmZWN0EjIKBHR5cGUYASABKA4yJC5saWdodHNwZWVkZHVlbC53cy5VcGdyYWRlRWZmZWN0VHlwZRIUCgptdWx0aXBsaWVyGAIgASgBSAASEwoJdW5sb2NrX2lkGAMgASgJSABCBwoFdmFsdWUieQoSUGxheWVyQ2FwYWJpbGl0aWVzEhgKEHNwZWVkX211bHRpcGxpZXIYASABKAESGQoRdW5sb2NrZWRfbWlzc2lsZXMYAiADKAkSFQoNaGVhdF9jYXBhY2l0eRgDIAEoARIXCg9oZWF0X2VmZmljaWVuY3kYBCABKAEi9AEKB0RhZ05vZGUSCgoCaWQYASABKAkSLAoEa2luZBgCIAEoDjIeLmxpZ2h0c3BlZWRkdWVsLndzLkRhZ05vZGVLaW5kEg0KBWxhYmVsGAMgASgJEjAKBnN0YXR1cxgEIAEoDjIgLmxpZ2h0c3BlZWRkdWVsLndzLkRhZ05vZGVTdGF0dXMSEwoLcmVtYWluaW5nX3MYBSABKAESEgoKZHVyYXRpb25fcxgGIAEoARISCgpyZXBlYXRhYmxlGAcgASgIEjEKB2VmZmVjdHMYCCADKAsyIC5saWdodHNwZWVkZHVlbC53cy5VcGdyYWRlRWZmZWN0IjUKCERhZ1N0YXRlEikKBW5vZGVzGAEgAygLMhoubGlnaHRzcGVlZGR1ZWwud3MuRGFnTm9kZSIbCghEYWdTdGFydBIPCgdub2RlX2lkGAEgASgJIhwKCURhZ0NhbmNlbBIPCgdub2RlX2lkGAEgASgJIjEKC0RhZ1N0b3J5QWNrEg8KB25vZGVfaWQYASABKAkSEQoJY2hvaWNlX2lkGAIgASgJIgkKB0RhZ0xpc3QiOwoPRGFnTGlzdFJlc3BvbnNlEigKA2RhZxgBIAEoCzIbLmxpZ2h0c3BlZWRkdWVsLndzLkRhZ1N0YXRlIloKDUludmVudG9yeUl0ZW0SDAoEdHlwZRgBIAEoCRISCgp2YXJpYW50X2lkGAIgASgJEhUKDWhlYXRfY2FwYWNpdHkYAyABKAESEAoIcXVhbnRpdHkYBCABKAUiPAoJSW52ZW50b3J5Ei8KBWl0ZW1zGAEgAygLMiAubGlnaHRzcGVlZGR1ZWwud3MuSW52ZW50b3J5SXRlbSIvChNTdG9yeURpYWxvZ3VlQ2hvaWNlEgoKAmlkGAEgASgJEgwKBHRleHQYAiABKAkiLwoQU3RvcnlUdXRvcmlhbFRpcBINCgV0aXRsZRgBIAEoCRIMCgR0ZXh0GAIgASgJIoACCg1TdG9yeURpYWxvZ3VlEg8KB3NwZWFrZXIYASABKAkSDAoEdGV4dBgCIAEoCRIuCgZpbnRlbnQYAyABKA4yHi5saWdodHNwZWVkZHVlbC53cy5TdG9yeUludGVudBIWCg5jb250aW51ZV9sYWJlbBgEIAEoCRI3CgdjaG9pY2VzGAUgAygLMiYubGlnaHRzcGVlZGR1ZWwud3MuU3RvcnlEaWFsb2d1ZUNob2ljZRI+Cgx0dXRvcmlhbF90aXAYBiABKAsyIy5saWdodHNwZWVkZHVlbC53cy5TdG9yeVR1dG9yaWFsVGlwSACIAQFCDwoNX3R1dG9yaWFsX3RpcCJECgpTdG9yeUV2ZW50EhIKCmNoYXB0ZXJfaWQYASABKAkSDwoHbm9kZV9pZBgCIAEoCRIRCgl0aW1lc3RhbXAYAyABKAEilwIKClN0b3J5U3RhdGUSEwoLYWN0aXZlX25vZGUYASABKAkSNwoIZGlhbG9ndWUYAiABKAsyIC5saWdodHNwZWVkZHVlbC53cy5TdG9yeURpYWxvZ3VlSACIAQESEQoJYXZhaWxhYmxlGAMgAygJEjcKBWZsYWdzGAQgAygLMigubGlnaHRzcGVlZGR1ZWwud3MuU3RvcnlTdGF0ZS5GbGFnc0VudHJ5EjQKDXJlY2VudF9ldmVudHMYBSADKAsyHS5saWdodHNwZWVkZHVlbC53cy5TdG9yeUV2ZW50GiwKCkZsYWdzRW50cnkSCwoDa2V5GAEgASgJEg0KBXZhbHVlGAIgASgIOgI4AUILCglfZGlhbG9ndWUiJgoQTWlzc2lvblNwYXduV2F2ZRISCgp3YXZlX2luZGV4GAEgASgFIjIKEU1pc3Npb25TdG9yeUV2ZW50Eg0KBWV2ZW50GAEgASgJEg4KBmJlYWNvbhgCIAEoBSqrAQoNRGFnTm9kZVN0YXR1cxIfChtEQUdfTk9ERV9TVEFUVVNfVU5TUEVDSUZJRUQQABIaChZEQUdfTk9ERV9TVEFUVVNfTE9DS0VEEAESHQoZREFHX05PREVfU1RBVFVTX0FWQUlMQUJMRRACEh8KG0RBR19OT0RFX1NUQVRVU19JTl9QUk9HUkVTUxADEh0KGURBR19OT0RFX1NUQVRVU19DT01QTEVURUQQBCqRAQoLRGFnTm9kZUtpbmQSHQoZREFHX05PREVfS0lORF9VTlNQRUNJRklFRBAAEhkKFURBR19OT0RFX0tJTkRfRkFDVE9SWRABEhYKEkRBR19OT0RFX0tJTkRfVU5JVBACEhcKE0RBR19OT0RFX0tJTkRfU1RPUlkQAxIXChNEQUdfTk9ERV9LSU5EX0NSQUZUEAQq2gEKEVVwZ3JhZGVFZmZlY3RUeXBlEiMKH1VQR1JBREVfRUZGRUNUX1RZUEVfVU5TUEVDSUZJRUQQABIoCiRVUEdSQURFX0VGRkVDVF9UWVBFX1NQRUVEX01VTFRJUExJRVIQARImCiJVUEdSQURFX0VGRkVDVF9UWVBFX01JU1NJTEVfVU5MT0NLEAISJQohVVBHUkFERV9FRkZFQ1RfVFlQRV9IRUFUX0NBUEFDSVRZEAMSJwojVVBHUkFERV9FRkZFQ1RfVFlQRV9IRUFUX0VGRklDSUVOQ1kQBCpcCgtTdG9yeUludGVudBIcChhTVE9SWV9JTlRFTlRfVU5TUEVDSUZJRUQQABIYChRTVE9SWV9JTlRFTlRfRkFDVE9SWRABEhUKEVNUT1JZX0lOVEVOVF9VTklUEAJCIlogTGlnaHRTcGVlZER1ZWwvaW50ZXJuYWwvcHJvdG8vd3NiBnByb3RvMw");
      WsEnvelopeSchema = /* @__PURE__ */ messageDesc(file_proto_ws_messages, 0);
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/types.js
  var init_types2 = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/types.js"() {
    }
  });

  // web/node_modules/@bufbuild/protobuf/dist/esm/equals.js
  var init_equals = __esm({
    "web/node_modules/@bufbuild/protobuf/dist/esm/equals.js"() {
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
      init_types2();
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
        nodes: msg.dag.nodes.map((n) => ({
          id: n.id,
          kind: n.kind,
          label: n.label,
          status: n.status,
          remaining_s: n.remainingS,
          duration_s: n.durationS,
          repeatable: n.repeatable,
          effects: n.effects
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
    let lastSig = "";
    function computeSig(nodes) {
      return nodes.slice().sort((a, b) => a.id.localeCompare(b.id)).map((n) => `${n.id}:${n.status}`).join("|");
    }
    function renderUpgrades(force = false) {
      var _a;
      const all = ((_a = state.dag) == null ? void 0 : _a.nodes) || [];
      const upgradeNodes = all.filter((n) => n.kind === "unit" || n.id.startsWith("upgrade."));
      const sig = computeSig(upgradeNodes);
      if (!force && sig === lastSig) return;
      lastSig = sig;
      renderTechTree(upgradeNodes, container);
    }
    function togglePanel(visible) {
      panel.classList.toggle("visible", visible);
      if (visible) {
        renderUpgrades();
      }
    }
    bus.on("upgrades:toggle", () => {
      const next = !panel.classList.contains("visible");
      togglePanel(next);
      if (next) renderUpgrades(true);
    });
    bus.on("upgrades:show", () => {
      togglePanel(true);
      renderUpgrades(true);
    });
    bus.on("upgrades:hide", () => togglePanel(false));
    closeBtn.addEventListener("click", () => togglePanel(false));
    overlay.addEventListener("click", () => togglePanel(false));
    bus.on("state:updated", () => {
      if (panel.classList.contains("visible")) {
        renderUpgrades(false);
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
    const sorted = nodes.slice().sort((a, b) => a.id.localeCompare(b.id));
    container.innerHTML = `
    <div class="tech-tree">
      ${sorted.length > 0 ? sorted.map(renderNode).join("") : '<div class="muted">No upgrades available</div>'}
    </div>
  `;
  }
  function effectTypeToString(t) {
    if (typeof t === "string") return t;
    if (typeof t === "number") {
      switch (t) {
        case 1 /* SPEED_MULTIPLIER */:
          return "speed_multiplier";
        case 2 /* MISSILE_UNLOCK */:
          return "missile_unlock";
        case 3 /* HEAT_CAPACITY */:
          return "heat_capacity";
        case 4 /* HEAT_EFFICIENCY */:
          return "heat_efficiency";
        default:
          return "unknown";
      }
    }
    return "unknown";
  }
  function renderNode(node) {
    var _a;
    const statusClass = `node-${node.status}`;
    const effectsHtml = ((_a = node.effects) == null ? void 0 : _a.map((e) => {
      const type = effectTypeToString(e.type);
      const value = e.value;
      const isShip = node.id.startsWith("upgrade.ship.");
      const isMissile = node.id.startsWith("upgrade.missile.");
      if (type === "missile_unlock") {
        return `Unlock ${value}`;
      }
      if (typeof value === "number") {
        const pct = (value - 1) * 100;
        const pctStr = Number.isFinite(pct) ? pct.toFixed(0) : "0";
        if (type === "speed_multiplier") {
          return isShip ? `+${pctStr}% Ship Speed` : isMissile ? `+${pctStr}% Missile Speed` : `+${pctStr}% Speed`;
        }
        if (type === "heat_capacity") {
          return isShip ? `+${pctStr}% Ship Heat` : isMissile ? `+${pctStr}% Missile Heat` : `+${pctStr}% Heat Capacity`;
        }
        if (type === "heat_efficiency") {
          return `+${pctStr}% Cooling`;
        }
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
      init_ws_messages_pb();
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL2J1cy50cyIsICJzcmMvc3RhdGUudHMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS9yZWZsZWN0L25hbWVzLmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vd2lyZS92YXJpbnQuanMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS9wcm90by1pbnQ2NC5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL2Rlc2NyaXB0b3JzLmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vcmVmbGVjdC9zY2FsYXIuanMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS9yZWZsZWN0L3Vuc2FmZS5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL2NvZGVnZW52Mi9yZXN0b3JlLWpzb24tbmFtZXMuanMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS93aXJlL3RleHQtZm9ybWF0LmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vcmVmbGVjdC9uZXN0ZWQtdHlwZXMuanMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS9yZWdpc3RyeS5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL2NvZGVnZW52Mi9ib290LmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vZmllbGRzLmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vd2lyZS9iYXNlNjQtZW5jb2RpbmcuanMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS9pcy1tZXNzYWdlLmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vcmVmbGVjdC9lcnJvci5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL3JlZmxlY3QvZ3VhcmQuanMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS93aXJlL3RleHQtZW5jb2RpbmcuanMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS93aXJlL2JpbmFyeS1lbmNvZGluZy5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL3JlZmxlY3QvcmVmbGVjdC1jaGVjay5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL3drdC93cmFwcGVycy5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL2NyZWF0ZS5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL3JlZmxlY3QvcmVmbGVjdC5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL3RvLWJpbmFyeS5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL2Nsb25lLmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vY29kZWdlbnYyL21lc3NhZ2UuanMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS9jb2RlZ2VudjIvZW51bS5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL3drdC9nZW4vZ29vZ2xlL3Byb3RvYnVmL2Rlc2NyaXB0b3JfcGIuanMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS9jb2RlZ2VudjIvZW1iZWQuanMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS9jb2RlZ2VudjIvZXh0ZW5zaW9uLmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vZnJvbS1iaW5hcnkuanMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS9jb2RlZ2VudjIvZmlsZS5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL2NvZGVnZW52Mi9zZXJ2aWNlLmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vY29kZWdlbnYyL3N5bWJvbHMuanMiLCAibm9kZV9tb2R1bGVzL0BidWZidWlsZC9wcm90b2J1Zi9kaXN0L2VzbS9jb2RlZ2VudjIvc2NhbGFyLmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vY29kZWdlbnYyL3R5cGVzLmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vY29kZWdlbnYyL2luZGV4LmpzIiwgInNyYy9wcm90by9wcm90by93c19tZXNzYWdlc19wYi50cyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL3R5cGVzLmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vZXF1YWxzLmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vdG8tanNvbi5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL2Zyb20tanNvbi5qcyIsICJub2RlX21vZHVsZXMvQGJ1ZmJ1aWxkL3Byb3RvYnVmL2Rpc3QvZXNtL21lcmdlLmpzIiwgIm5vZGVfbW9kdWxlcy9AYnVmYnVpbGQvcHJvdG9idWYvZGlzdC9lc20vaW5kZXguanMiLCAic3JjL3Byb3RvX2hlbHBlcnMudHMiLCAic3JjL25ldC50cyIsICJzcmMvdXBncmFkZXMudHMiLCAic3JjL2xvYmJ5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgdHlwZSB7IE1pc3NpbGVTZWxlY3Rpb24gfSBmcm9tIFwiLi9zdGF0ZVwiO1xuaW1wb3J0IHR5cGUgeyBEaWFsb2d1ZUNvbnRlbnQgfSBmcm9tIFwiLi9zdG9yeS90eXBlc1wiO1xuXG5leHBvcnQgdHlwZSBTaGlwQ29udGV4dCA9IFwic2hpcFwiIHwgXCJtaXNzaWxlXCI7XG5leHBvcnQgdHlwZSBTaGlwVG9vbCA9IFwic2V0XCIgfCBcInNlbGVjdFwiIHwgbnVsbDtcbmV4cG9ydCB0eXBlIE1pc3NpbGVUb29sID0gXCJzZXRcIiB8IFwic2VsZWN0XCIgfCBudWxsO1xuXG5leHBvcnQgaW50ZXJmYWNlIEV2ZW50TWFwIHtcbiAgXCJjb250ZXh0OmNoYW5nZWRcIjogeyBjb250ZXh0OiBTaGlwQ29udGV4dCB9O1xuICBcInNoaXA6dG9vbENoYW5nZWRcIjogeyB0b29sOiBTaGlwVG9vbCB9O1xuICBcInNoaXA6d2F5cG9pbnRBZGRlZFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJzaGlwOndheXBvaW50TW92ZWRcIjogeyBpbmRleDogbnVtYmVyOyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xuICBcInNoaXA6bGVnU2VsZWN0ZWRcIjogeyBpbmRleDogbnVtYmVyIHwgbnVsbCB9O1xuICBcInNoaXA6d2F5cG9pbnREZWxldGVkXCI6IHsgaW5kZXg6IG51bWJlciB9O1xuICBcInNoaXA6d2F5cG9pbnRzQ2xlYXJlZFwiOiB2b2lkO1xuICBcInNoaXA6Y2xlYXJJbnZva2VkXCI6IHZvaWQ7XG4gIFwic2hpcDpzcGVlZENoYW5nZWRcIjogeyB2YWx1ZTogbnVtYmVyIH07XG4gIFwic2hpcDpoZWF0UHJvamVjdGlvblVwZGF0ZWRcIjogeyBoZWF0VmFsdWVzOiBudW1iZXJbXSB9O1xuICBcImhlYXQ6bWFya2VyQWxpZ25lZFwiOiB7IHZhbHVlOiBudW1iZXI7IG1hcmtlcjogbnVtYmVyIH07XG4gIFwiaGVhdDp3YXJuRW50ZXJlZFwiOiB7IHZhbHVlOiBudW1iZXI7IHdhcm5BdDogbnVtYmVyIH07XG4gIFwiaGVhdDpjb29sZWRCZWxvd1dhcm5cIjogeyB2YWx1ZTogbnVtYmVyOyB3YXJuQXQ6IG51bWJlciB9O1xuICBcImhlYXQ6c3RhbGxUcmlnZ2VyZWRcIjogeyBzdGFsbFVudGlsOiBudW1iZXIgfTtcbiAgXCJoZWF0OnN0YWxsUmVjb3ZlcmVkXCI6IHsgdmFsdWU6IG51bWJlciB9O1xuICBcImhlYXQ6ZHVhbE1ldGVyRGl2ZXJnZWRcIjogeyBwbGFubmVkOiBudW1iZXI7IGFjdHVhbDogbnVtYmVyIH07XG4gIFwidWk6d2F5cG9pbnRIb3ZlclN0YXJ0XCI6IHsgaW5kZXg6IG51bWJlciB9O1xuICBcInVpOndheXBvaW50SG92ZXJFbmRcIjogeyBpbmRleDogbnVtYmVyIH07XG4gIFwibWlzc2lsZTpyb3V0ZUFkZGVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpyb3V0ZURlbGV0ZWRcIjogeyByb3V0ZUlkOiBzdHJpbmcgfTtcbiAgXCJtaXNzaWxlOnJvdXRlUmVuYW1lZFwiOiB7IHJvdXRlSWQ6IHN0cmluZzsgbmFtZTogc3RyaW5nIH07XG4gIFwibWlzc2lsZTphY3RpdmVSb3V0ZUNoYW5nZWRcIjogeyByb3V0ZUlkOiBzdHJpbmcgfCBudWxsIH07XG4gIFwibWlzc2lsZTp0b29sQ2hhbmdlZFwiOiB7IHRvb2w6IE1pc3NpbGVUb29sIH07XG4gIFwibWlzc2lsZTpzZWxlY3Rpb25DaGFuZ2VkXCI6IHsgc2VsZWN0aW9uOiBNaXNzaWxlU2VsZWN0aW9uIHwgbnVsbCB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnRBZGRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZzsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnRNb3ZlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZzsgaW5kZXg6IG51bWJlcjsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOndheXBvaW50RGVsZXRlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZzsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6d2F5cG9pbnRzQ2xlYXJlZFwiOiB7IHJvdXRlSWQ6IHN0cmluZyB9O1xuICBcIm1pc3NpbGU6c3BlZWRDaGFuZ2VkXCI6IHsgdmFsdWU6IG51bWJlcjsgaW5kZXg6IG51bWJlciB9O1xuICBcIm1pc3NpbGU6YWdyb0NoYW5nZWRcIjogeyB2YWx1ZTogbnVtYmVyIH07XG4gIFwibWlzc2lsZTpsYXVuY2hSZXF1ZXN0ZWRcIjogeyByb3V0ZUlkOiBzdHJpbmcgfTtcbiAgXCJtaXNzaWxlOmxhdW5jaGVkXCI6IHsgcm91dGVJZDogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpjb29sZG93blVwZGF0ZWRcIjogeyBzZWNvbmRzUmVtYWluaW5nOiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOmRlbGV0ZUludm9rZWRcIjogdm9pZDtcbiAgXCJtaXNzaWxlOnByZXNldFNlbGVjdGVkXCI6IHsgcHJlc2V0TmFtZTogc3RyaW5nIH07XG4gIFwibWlzc2lsZTpoZWF0UHJvamVjdGlvblVwZGF0ZWRcIjogeyB3aWxsT3ZlcmhlYXQ6IGJvb2xlYW47IG92ZXJoZWF0QXQ/OiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOm92ZXJoZWF0ZWRcIjogeyBtaXNzaWxlSWQ6IHN0cmluZzsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcbiAgXCJtaXNzaWxlOmNyYWZ0UmVxdWVzdGVkXCI6IHsgbm9kZUlkOiBzdHJpbmc7IGhlYXRDYXBhY2l0eTogbnVtYmVyIH07XG4gIFwiaGVscDp2aXNpYmxlQ2hhbmdlZFwiOiB7IHZpc2libGU6IGJvb2xlYW4gfTtcbiAgXCJzdGF0ZTp1cGRhdGVkXCI6IHZvaWQ7XG4gIFwiY29ubmVjdGlvbjplcnJvclwiOiB7IG1lc3NhZ2U6IHN0cmluZyB9O1xuICBcImRhZzpsaXN0XCI6IHsgbm9kZXM6IEFycmF5PHsgaWQ6IHN0cmluZzsga2luZDogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyBzdGF0dXM6IHN0cmluZzsgcmVtYWluaW5nX3M6IG51bWJlcjsgZHVyYXRpb25fczogbnVtYmVyOyByZXBlYXRhYmxlOiBib29sZWFuIH0+IH07XG4gIFwidHV0b3JpYWw6c3RhcnRlZFwiOiB7IGlkOiBzdHJpbmcgfTtcbiAgXCJ0dXRvcmlhbDpzdGVwQ2hhbmdlZFwiOiB7IGlkOiBzdHJpbmc7IHN0ZXBJbmRleDogbnVtYmVyOyB0b3RhbDogbnVtYmVyIH07XG4gIFwidHV0b3JpYWw6Y29tcGxldGVkXCI6IHsgaWQ6IHN0cmluZyB9O1xuICBcInR1dG9yaWFsOnNraXBwZWRcIjogeyBpZDogc3RyaW5nOyBhdFN0ZXA6IG51bWJlciB9O1xuICBcImJvdDpzcGF3blJlcXVlc3RlZFwiOiB2b2lkO1xuICBcImRpYWxvZ3VlOm9wZW5lZFwiOiB7IG5vZGVJZDogc3RyaW5nOyBjaGFwdGVySWQ6IHN0cmluZyB9O1xuICBcImRpYWxvZ3VlOmNsb3NlZFwiOiB7IG5vZGVJZDogc3RyaW5nOyBjaGFwdGVySWQ6IHN0cmluZyB9O1xuICBcImRpYWxvZ3VlOmNob2ljZVwiOiB7IG5vZGVJZDogc3RyaW5nOyBjaG9pY2VJZDogc3RyaW5nOyBjaGFwdGVySWQ6IHN0cmluZyB9O1xuICBcInN0b3J5OmZsYWdVcGRhdGVkXCI6IHsgZmxhZzogc3RyaW5nOyB2YWx1ZTogYm9vbGVhbiB9O1xuICBcInN0b3J5OnByb2dyZXNzZWRcIjogeyBjaGFwdGVySWQ6IHN0cmluZzsgbm9kZUlkOiBzdHJpbmcgfTtcbiAgXCJzdG9yeTpub2RlQWN0aXZhdGVkXCI6IHsgbm9kZUlkOiBzdHJpbmc7IGRpYWxvZ3VlPzogRGlhbG9ndWVDb250ZW50IH07XG4gIFwibWlzc2lvbjpzdGFydFwiOiB2b2lkO1xuICBcIm1pc3Npb246YmVhY29uLWxvY2tlZFwiOiB7IGluZGV4OiBudW1iZXIgfTtcbiAgXCJtaXNzaW9uOmNvbXBsZXRlZFwiOiB2b2lkO1xuICBcImF1ZGlvOnJlc3VtZVwiOiB2b2lkO1xuICBcImF1ZGlvOm11dGVcIjogdm9pZDtcbiAgXCJhdWRpbzp1bm11dGVcIjogdm9pZDtcbiAgXCJhdWRpbzpzZXQtbWFzdGVyLWdhaW5cIjogeyBnYWluOiBudW1iZXIgfTtcbiAgXCJhdWRpbzpzZnhcIjogeyBuYW1lOiBcInVpXCIgfCBcImxhc2VyXCIgfCBcInRocnVzdFwiIHwgXCJleHBsb3Npb25cIiB8IFwibG9ja1wiIHwgXCJkaWFsb2d1ZVwiOyB2ZWxvY2l0eT86IG51bWJlcjsgcGFuPzogbnVtYmVyIH07XG4gIFwiYXVkaW86bXVzaWM6c2V0LXNjZW5lXCI6IHsgc2NlbmU6IFwiYW1iaWVudFwiIHwgXCJjb21iYXRcIiB8IFwibG9iYnlcIjsgc2VlZD86IG51bWJlciB9O1xuICBcImF1ZGlvOm11c2ljOnBhcmFtXCI6IHsga2V5OiBzdHJpbmc7IHZhbHVlOiBudW1iZXIgfTtcbiAgXCJhdWRpbzptdXNpYzp0cmFuc3BvcnRcIjogeyBjbWQ6IFwic3RhcnRcIiB8IFwic3RvcFwiIHwgXCJwYXVzZVwiIH07XG4gIFwidXBncmFkZXM6dG9nZ2xlXCI6IHZvaWQ7XG4gIFwidXBncmFkZXM6c2hvd1wiOiB2b2lkO1xuICBcInVwZ3JhZGVzOmhpZGVcIjogdm9pZDtcbiAgXCJ1cGdyYWRlczpjb3VudFVwZGF0ZWRcIjogeyBjb3VudDogbnVtYmVyIH07XG59XG5cbmV4cG9ydCB0eXBlIEV2ZW50S2V5ID0ga2V5b2YgRXZlbnRNYXA7XG5leHBvcnQgdHlwZSBFdmVudFBheWxvYWQ8SyBleHRlbmRzIEV2ZW50S2V5PiA9IEV2ZW50TWFwW0tdO1xuZXhwb3J0IHR5cGUgSGFuZGxlcjxLIGV4dGVuZHMgRXZlbnRLZXk+ID0gKHBheWxvYWQ6IEV2ZW50UGF5bG9hZDxLPikgPT4gdm9pZDtcblxudHlwZSBWb2lkS2V5cyA9IHtcbiAgW0sgaW4gRXZlbnRLZXldOiBFdmVudE1hcFtLXSBleHRlbmRzIHZvaWQgPyBLIDogbmV2ZXJcbn1bRXZlbnRLZXldO1xuXG50eXBlIE5vblZvaWRLZXlzID0gRXhjbHVkZTxFdmVudEtleSwgVm9pZEtleXM+O1xuXG5leHBvcnQgaW50ZXJmYWNlIEV2ZW50QnVzIHtcbiAgb248SyBleHRlbmRzIEV2ZW50S2V5PihldmVudDogSywgaGFuZGxlcjogSGFuZGxlcjxLPik6ICgpID0+IHZvaWQ7XG4gIGVtaXQ8SyBleHRlbmRzIE5vblZvaWRLZXlzPihldmVudDogSywgcGF5bG9hZDogRXZlbnRQYXlsb2FkPEs+KTogdm9pZDtcbiAgZW1pdDxLIGV4dGVuZHMgVm9pZEtleXM+KGV2ZW50OiBLKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUV2ZW50QnVzKCk6IEV2ZW50QnVzIHtcbiAgY29uc3QgaGFuZGxlcnMgPSBuZXcgTWFwPEV2ZW50S2V5LCBTZXQ8RnVuY3Rpb24+PigpO1xuICByZXR1cm4ge1xuICAgIG9uKGV2ZW50LCBoYW5kbGVyKSB7XG4gICAgICBsZXQgc2V0ID0gaGFuZGxlcnMuZ2V0KGV2ZW50KTtcbiAgICAgIGlmICghc2V0KSB7XG4gICAgICAgIHNldCA9IG5ldyBTZXQoKTtcbiAgICAgICAgaGFuZGxlcnMuc2V0KGV2ZW50LCBzZXQpO1xuICAgICAgfVxuICAgICAgc2V0LmFkZChoYW5kbGVyKTtcbiAgICAgIHJldHVybiAoKSA9PiBzZXQhLmRlbGV0ZShoYW5kbGVyKTtcbiAgICB9LFxuICAgIGVtaXQoZXZlbnQ6IEV2ZW50S2V5LCBwYXlsb2FkPzogdW5rbm93bikge1xuICAgICAgY29uc3Qgc2V0ID0gaGFuZGxlcnMuZ2V0KGV2ZW50KTtcbiAgICAgIGlmICghc2V0IHx8IHNldC5zaXplID09PSAwKSByZXR1cm47XG4gICAgICBmb3IgKGNvbnN0IGZuIG9mIHNldCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIChmbiBhcyAodmFsdWU/OiB1bmtub3duKSA9PiB2b2lkKShwYXlsb2FkKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihgW2J1c10gaGFuZGxlciBmb3IgJHtldmVudH0gZmFpbGVkYCwgZXJyKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gIH07XG59XG4iLCAiaW1wb3J0IHR5cGUgeyBTaGlwQ29udGV4dCwgU2hpcFRvb2wsIE1pc3NpbGVUb29sIH0gZnJvbSBcIi4vYnVzXCI7XG5pbXBvcnQgdHlwZSB7IERpYWxvZ3VlQ29udGVudCB9IGZyb20gXCIuL3N0b3J5L3R5cGVzXCI7XG5cbmV4cG9ydCBjb25zdCBNSVNTSUxFX01JTl9TUEVFRCA9IDQwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTUFYX1NQRUVEID0gMjUwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTUlOX0FHUk8gPSAxMDA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9NQVhfTElGRVRJTUUgPSAxMjA7XG5leHBvcnQgY29uc3QgTUlTU0lMRV9NSU5fTElGRVRJTUUgPSAyMDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX0xJRkVUSU1FX1NQRUVEX1BFTkFMVFkgPSA4MDtcbmV4cG9ydCBjb25zdCBNSVNTSUxFX0xJRkVUSU1FX0FHUk9fUEVOQUxUWSA9IDQwO1xuZXhwb3J0IGNvbnN0IE1JU1NJTEVfTElGRVRJTUVfQUdST19SRUYgPSAyMDAwO1xuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVMaW1pdHMge1xuICBzcGVlZE1pbjogbnVtYmVyO1xuICBzcGVlZE1heDogbnVtYmVyO1xuICBhZ3JvTWluOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgV2F5cG9pbnQge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgc3BlZWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIZWF0VmlldyB7XG4gIHZhbHVlOiBudW1iZXI7XG4gIG1heDogbnVtYmVyO1xuICB3YXJuQXQ6IG51bWJlcjtcbiAgb3ZlcmhlYXRBdDogbnVtYmVyO1xuICBtYXJrZXJTcGVlZDogbnVtYmVyO1xuICBzdGFsbFVudGlsTXM6IG51bWJlcjsgLy8gY2xpZW50LXN5bmNlZCB0aW1lIGluIG1pbGxpc2Vjb25kc1xuICBrVXA6IG51bWJlcjtcbiAga0Rvd246IG51bWJlcjtcbiAgZXhwOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2hpcFNuYXBzaG90IHtcbiAgeDogbnVtYmVyO1xuICB5OiBudW1iZXI7XG4gIHZ4OiBudW1iZXI7XG4gIHZ5OiBudW1iZXI7XG4gIGhwPzogbnVtYmVyO1xuICBraWxscz86IG51bWJlcjtcbiAgd2F5cG9pbnRzOiBXYXlwb2ludFtdO1xuICBjdXJyZW50V2F5cG9pbnRJbmRleD86IG51bWJlcjtcbiAgaGVhdD86IEhlYXRWaWV3O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEdob3N0U25hcHNob3Qge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlU25hcHNob3Qge1xuICB4OiBudW1iZXI7XG4gIHk6IG51bWJlcjtcbiAgdng6IG51bWJlcjtcbiAgdnk6IG51bWJlcjtcbiAgc2VsZj86IGJvb2xlYW47XG4gIGFncm9fcmFkaXVzOiBudW1iZXI7XG4gIGhlYXQ/OiBIZWF0VmlldzsgLy8gTWlzc2lsZSBoZWF0IGRhdGFcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlUm91dGUge1xuICBpZDogc3RyaW5nO1xuICBuYW1lOiBzdHJpbmc7XG4gIHdheXBvaW50czogV2F5cG9pbnRbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBIZWF0UGFyYW1zIHtcbiAgbWF4OiBudW1iZXI7XG4gIHdhcm5BdDogbnVtYmVyO1xuICBvdmVyaGVhdEF0OiBudW1iZXI7XG4gIG1hcmtlclNwZWVkOiBudW1iZXI7XG4gIGtVcDogbnVtYmVyO1xuICBrRG93bjogbnVtYmVyO1xuICBleHA6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlQ29uZmlnIHtcbiAgc3BlZWQ6IG51bWJlcjtcbiAgYWdyb1JhZGl1czogbnVtYmVyO1xuICBsaWZldGltZTogbnVtYmVyO1xuICBoZWF0UGFyYW1zPzogSGVhdFBhcmFtczsgLy8gT3B0aW9uYWwgY3VzdG9tIGhlYXQgY29uZmlndXJhdGlvblxufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVQcmVzZXQge1xuICBuYW1lOiBzdHJpbmc7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIHNwZWVkOiBudW1iZXI7XG4gIGFncm9SYWRpdXM6IG51bWJlcjtcbiAgaGVhdFBhcmFtczogSGVhdFBhcmFtcztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJbnZlbnRvcnlJdGVtIHtcbiAgdHlwZTogc3RyaW5nO1xuICB2YXJpYW50X2lkOiBzdHJpbmc7XG4gIGhlYXRfY2FwYWNpdHk6IG51bWJlcjtcbiAgcXVhbnRpdHk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJbnZlbnRvcnkge1xuICBpdGVtczogSW52ZW50b3J5SXRlbVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFVwZ3JhZGVFZmZlY3REYXRhIHtcbiAgdHlwZTogc3RyaW5nOyAvLyAnc3BlZWRfbXVsdGlwbGllcicsICdtaXNzaWxlX3VubG9jaycsIGV0Yy5cbiAgdmFsdWU6IG51bWJlciB8IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBEYWdOb2RlIHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogc3RyaW5nO1xuICBsYWJlbDogc3RyaW5nO1xuICBzdGF0dXM6IHN0cmluZzsgLy8gXCJsb2NrZWRcIiB8IFwiYXZhaWxhYmxlXCIgfCBcImluX3Byb2dyZXNzXCIgfCBcImNvbXBsZXRlZFwiXG4gIHJlbWFpbmluZ19zOiBudW1iZXI7XG4gIGR1cmF0aW9uX3M6IG51bWJlcjtcbiAgcmVwZWF0YWJsZTogYm9vbGVhbjtcbiAgZWZmZWN0cz86IFVwZ3JhZGVFZmZlY3REYXRhW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGFnU3RhdGUge1xuICBub2RlczogRGFnTm9kZVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBsYXllckNhcGFiaWxpdGllcyB7XG4gIHNwZWVkTXVsdGlwbGllcjogbnVtYmVyO1xuICB1bmxvY2tlZE1pc3NpbGVzOiBzdHJpbmdbXTtcbiAgaGVhdENhcGFjaXR5OiBudW1iZXI7XG4gIGhlYXRFZmZpY2llbmN5OiBudW1iZXI7XG59XG5cbi8vIE1pc3NpbGUgcHJlc2V0IGRlZmluaXRpb25zIG1hdGNoaW5nIGJhY2tlbmRcbmV4cG9ydCBjb25zdCBNSVNTSUxFX1BSRVNFVFM6IE1pc3NpbGVQcmVzZXRbXSA9IFtcbiAge1xuICAgIG5hbWU6IFwiU2NvdXRcIixcbiAgICBkZXNjcmlwdGlvbjogXCJTbG93LCBlZmZpY2llbnQsIGxvbmctcmFuZ2UuIEhpZ2ggaGVhdCBjYXBhY2l0eS5cIixcbiAgICBzcGVlZDogODAsXG4gICAgYWdyb1JhZGl1czogMTUwMCxcbiAgICBoZWF0UGFyYW1zOiB7XG4gICAgICBtYXg6IDYwLFxuICAgICAgd2FybkF0OiA0MixcbiAgICAgIG92ZXJoZWF0QXQ6IDYwLFxuICAgICAgbWFya2VyU3BlZWQ6IDcwLFxuICAgICAga1VwOiAyMCxcbiAgICAgIGtEb3duOiAxNSxcbiAgICAgIGV4cDogMS41LFxuICAgIH0sXG4gIH0sXG4gIHtcbiAgICBuYW1lOiBcIkh1bnRlclwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIkJhbGFuY2VkIHNwZWVkIGFuZCBkZXRlY3Rpb24uIFN0YW5kYXJkIGhlYXQuXCIsXG4gICAgc3BlZWQ6IDE1MCxcbiAgICBhZ3JvUmFkaXVzOiA4MDAsXG4gICAgaGVhdFBhcmFtczoge1xuICAgICAgbWF4OiA1MCxcbiAgICAgIHdhcm5BdDogMzUsXG4gICAgICBvdmVyaGVhdEF0OiA1MCxcbiAgICAgIG1hcmtlclNwZWVkOiAxMjAsXG4gICAgICBrVXA6IDI4LFxuICAgICAga0Rvd246IDEyLFxuICAgICAgZXhwOiAxLjUsXG4gICAgfSxcbiAgfSxcbiAge1xuICAgIG5hbWU6IFwiU25pcGVyXCIsXG4gICAgZGVzY3JpcHRpb246IFwiRmFzdCwgbmFycm93IGRldGVjdGlvbi4gTG93IGhlYXQgY2FwYWNpdHkuXCIsXG4gICAgc3BlZWQ6IDIyMCxcbiAgICBhZ3JvUmFkaXVzOiAzMDAsXG4gICAgaGVhdFBhcmFtczoge1xuICAgICAgbWF4OiA0MCxcbiAgICAgIHdhcm5BdDogMjgsXG4gICAgICBvdmVyaGVhdEF0OiA0MCxcbiAgICAgIG1hcmtlclNwZWVkOiAxODAsXG4gICAgICBrVXA6IDM1LFxuICAgICAga0Rvd246IDgsXG4gICAgICBleHA6IDEuNSxcbiAgICB9LFxuICB9LFxuXTtcblxuZXhwb3J0IGludGVyZmFjZSBXb3JsZE1ldGEge1xuICBjPzogbnVtYmVyO1xuICB3PzogbnVtYmVyO1xuICBoPzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEJlYWNvbkRlZmluaXRpb24ge1xuICBjeDogbnVtYmVyO1xuICBjeTogbnVtYmVyO1xuICByYWRpdXM6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBNaXNzaW9uU3RhdGUge1xuICBhY3RpdmU6IGJvb2xlYW47XG4gIG1pc3Npb25JZDogc3RyaW5nO1xuICBiZWFjb25JbmRleDogbnVtYmVyO1xuICBob2xkQWNjdW06IG51bWJlcjtcbiAgaG9sZFJlcXVpcmVkOiBudW1iZXI7XG4gIGJlYWNvbnM6IEJlYWNvbkRlZmluaXRpb25bXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdG9yeUV2ZW50IHtcbiAgY2hhcHRlcjogc3RyaW5nO1xuICBub2RlOiBzdHJpbmc7XG4gIHRpbWVzdGFtcDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0b3J5U3RhdGUge1xuICBhY3RpdmVOb2RlOiBzdHJpbmcgfCBudWxsO1xuICBkaWFsb2d1ZTogRGlhbG9ndWVDb250ZW50IHwgbnVsbDtcbiAgYXZhaWxhYmxlOiBzdHJpbmdbXTtcbiAgZmxhZ3M6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+O1xuICByZWNlbnRFdmVudHM6IFN0b3J5RXZlbnRbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBBcHBTdGF0ZSB7XG4gIG5vdzogbnVtYmVyO1xuICBub3dTeW5jZWRBdDogbnVtYmVyO1xuICBtZTogU2hpcFNuYXBzaG90IHwgbnVsbDtcbiAgZ2hvc3RzOiBHaG9zdFNuYXBzaG90W107XG4gIG1pc3NpbGVzOiBNaXNzaWxlU25hcHNob3RbXTtcbiAgbWlzc2lsZVJvdXRlczogTWlzc2lsZVJvdXRlW107XG4gIGFjdGl2ZU1pc3NpbGVSb3V0ZUlkOiBzdHJpbmcgfCBudWxsO1xuICBuZXh0TWlzc2lsZVJlYWR5QXQ6IG51bWJlcjtcbiAgbWlzc2lsZUNvbmZpZzogTWlzc2lsZUNvbmZpZztcbiAgbWlzc2lsZUxpbWl0czogTWlzc2lsZUxpbWl0cztcbiAgd29ybGRNZXRhOiBXb3JsZE1ldGE7XG4gIGludmVudG9yeTogSW52ZW50b3J5IHwgbnVsbDtcbiAgZGFnOiBEYWdTdGF0ZSB8IG51bGw7XG4gIG1pc3Npb246IE1pc3Npb25TdGF0ZSB8IG51bGw7XG4gIHN0b3J5OiBTdG9yeVN0YXRlIHwgbnVsbDtcbiAgY3JhZnRIZWF0Q2FwYWNpdHk6IG51bWJlcjsgLy8gSGVhdCBjYXBhY2l0eSBzbGlkZXIgdmFsdWUgZm9yIGNyYWZ0aW5nXG4gIGNhcGFiaWxpdGllczogUGxheWVyQ2FwYWJpbGl0aWVzIHwgbnVsbDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTZWxlY3Rpb24ge1xuICB0eXBlOiBcIndheXBvaW50XCIgfCBcImxlZ1wiO1xuICBpbmRleDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVTZWxlY3Rpb24ge1xuICB0eXBlOiBcIndheXBvaW50XCIgfCBcImxlZ1wiO1xuICBpbmRleDogbnVtYmVyO1xufVxuXG5leHBvcnQgdHlwZSBBY3RpdmVUb29sID1cbiAgfCBcInNoaXAtc2V0XCJcbiAgfCBcInNoaXAtc2VsZWN0XCJcbiAgfCBcIm1pc3NpbGUtc2V0XCJcbiAgfCBcIm1pc3NpbGUtc2VsZWN0XCJcbiAgfCBudWxsO1xuXG5leHBvcnQgaW50ZXJmYWNlIFVJU3RhdGUge1xuICBpbnB1dENvbnRleHQ6IFNoaXBDb250ZXh0O1xuICBzaGlwVG9vbDogU2hpcFRvb2w7XG4gIG1pc3NpbGVUb29sOiBNaXNzaWxlVG9vbDtcbiAgYWN0aXZlVG9vbDogQWN0aXZlVG9vbDtcbiAgc2hvd1NoaXBSb3V0ZTogYm9vbGVhbjtcbiAgaGVscFZpc2libGU6IGJvb2xlYW47XG4gIHpvb206IG51bWJlcjtcbiAgcGFuWDogbnVtYmVyO1xuICBwYW5ZOiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVJbml0aWFsVUlTdGF0ZSgpOiBVSVN0YXRlIHtcbiAgcmV0dXJuIHtcbiAgICBpbnB1dENvbnRleHQ6IFwic2hpcFwiLFxuICAgIHNoaXBUb29sOiBcInNldFwiLFxuICAgIG1pc3NpbGVUb29sOiBudWxsLFxuICAgIGFjdGl2ZVRvb2w6IFwic2hpcC1zZXRcIixcbiAgICBzaG93U2hpcFJvdXRlOiB0cnVlLFxuICAgIGhlbHBWaXNpYmxlOiBmYWxzZSxcbiAgICB6b29tOiAxLjAsXG4gICAgcGFuWDogMCxcbiAgICBwYW5ZOiAwLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlSW5pdGlhbFN0YXRlKGxpbWl0czogTWlzc2lsZUxpbWl0cyA9IHtcbiAgc3BlZWRNaW46IE1JU1NJTEVfTUlOX1NQRUVELFxuICBzcGVlZE1heDogTUlTU0lMRV9NQVhfU1BFRUQsXG4gIGFncm9NaW46IE1JU1NJTEVfTUlOX0FHUk8sXG59KTogQXBwU3RhdGUge1xuICByZXR1cm4ge1xuICAgIG5vdzogMCxcbiAgICBub3dTeW5jZWRBdDogdHlwZW9mIHBlcmZvcm1hbmNlICE9PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiBwZXJmb3JtYW5jZS5ub3cgPT09IFwiZnVuY3Rpb25cIlxuICAgICAgPyBwZXJmb3JtYW5jZS5ub3coKVxuICAgICAgOiBEYXRlLm5vdygpLFxuICAgIG1lOiBudWxsLFxuICAgIGdob3N0czogW10sXG4gICAgbWlzc2lsZXM6IFtdLFxuICAgIG1pc3NpbGVSb3V0ZXM6IFtdLFxuICAgIGFjdGl2ZU1pc3NpbGVSb3V0ZUlkOiBudWxsLFxuICAgIG5leHRNaXNzaWxlUmVhZHlBdDogMCxcbiAgICBtaXNzaWxlQ29uZmlnOiB7XG4gICAgICBzcGVlZDogMTgwLFxuICAgICAgYWdyb1JhZGl1czogODAwLFxuICAgICAgbGlmZXRpbWU6IG1pc3NpbGVMaWZldGltZUZvcigxODAsIDgwMCwgbGltaXRzKSxcbiAgICAgIGhlYXRQYXJhbXM6IE1JU1NJTEVfUFJFU0VUU1sxXS5oZWF0UGFyYW1zLCAvLyBEZWZhdWx0IHRvIEh1bnRlciBwcmVzZXRcbiAgICB9LFxuICAgIG1pc3NpbGVMaW1pdHM6IGxpbWl0cyxcbiAgICB3b3JsZE1ldGE6IHt9LFxuICAgIGludmVudG9yeTogbnVsbCxcbiAgICBkYWc6IG51bGwsXG4gICAgbWlzc2lvbjogbnVsbCxcbiAgICBzdG9yeTogbnVsbCxcbiAgICBjcmFmdEhlYXRDYXBhY2l0eTogODAsIC8vIERlZmF1bHQgdG8gYmFzaWMgbWlzc2lsZSBoZWF0IGNhcGFjaXR5XG4gICAgY2FwYWJpbGl0aWVzOiBudWxsLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xhbXAodmFsdWU6IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgubWF4KG1pbiwgTWF0aC5taW4obWF4LCB2YWx1ZSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWlzc2lsZUxpZmV0aW1lRm9yKHNwZWVkOiBudW1iZXIsIGFncm9SYWRpdXM6IG51bWJlciwgbGltaXRzOiBNaXNzaWxlTGltaXRzID0ge1xuICBzcGVlZE1pbjogTUlTU0lMRV9NSU5fU1BFRUQsXG4gIHNwZWVkTWF4OiBNSVNTSUxFX01BWF9TUEVFRCxcbiAgYWdyb01pbjogTUlTU0lMRV9NSU5fQUdSTyxcbn0pOiBudW1iZXIge1xuICBjb25zdCBtaW5TcGVlZCA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNaW4pID8gbGltaXRzLnNwZWVkTWluIDogTUlTU0lMRV9NSU5fU1BFRUQ7XG4gIGNvbnN0IG1heFNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5zcGVlZE1heCkgPyBsaW1pdHMuc3BlZWRNYXggOiBNSVNTSUxFX01BWF9TUEVFRDtcbiAgY29uc3QgbWluQWdybyA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuYWdyb01pbikgPyBsaW1pdHMuYWdyb01pbiA6IE1JU1NJTEVfTUlOX0FHUk87XG4gIGNvbnN0IHNwYW4gPSBtYXhTcGVlZCAtIG1pblNwZWVkO1xuICBjb25zdCBzcGVlZE5vcm0gPSBzcGFuID4gMCA/IGNsYW1wKChzcGVlZCAtIG1pblNwZWVkKSAvIHNwYW4sIDAsIDEpIDogMDtcbiAgY29uc3QgYWRqdXN0ZWRBZ3JvID0gTWF0aC5tYXgoMCwgYWdyb1JhZGl1cyAtIG1pbkFncm8pO1xuICBjb25zdCBhZ3JvTm9ybSA9IGNsYW1wKGFkanVzdGVkQWdybyAvIE1JU1NJTEVfTElGRVRJTUVfQUdST19SRUYsIDAsIDEpO1xuICBjb25zdCByZWR1Y3Rpb24gPSBzcGVlZE5vcm0gKiBNSVNTSUxFX0xJRkVUSU1FX1NQRUVEX1BFTkFMVFkgKyBhZ3JvTm9ybSAqIE1JU1NJTEVfTElGRVRJTUVfQUdST19QRU5BTFRZO1xuICBjb25zdCBiYXNlID0gTUlTU0lMRV9NQVhfTElGRVRJTUU7XG4gIHJldHVybiBjbGFtcChiYXNlIC0gcmVkdWN0aW9uLCBNSVNTSUxFX01JTl9MSUZFVElNRSwgTUlTU0lMRV9NQVhfTElGRVRJTUUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2FuaXRpemVNaXNzaWxlQ29uZmlnKFxuICBjZmc6IFBhcnRpYWw8UGljazxNaXNzaWxlQ29uZmlnLCBcInNwZWVkXCIgfCBcImFncm9SYWRpdXNcIiB8IFwiaGVhdFBhcmFtc1wiPj4sXG4gIGZhbGxiYWNrOiBNaXNzaWxlQ29uZmlnLFxuICBsaW1pdHM6IE1pc3NpbGVMaW1pdHMsXG4pOiBNaXNzaWxlQ29uZmlnIHtcbiAgY29uc3QgbWluU3BlZWQgPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLnNwZWVkTWluKSA/IGxpbWl0cy5zcGVlZE1pbiA6IE1JU1NJTEVfTUlOX1NQRUVEO1xuICBjb25zdCBtYXhTcGVlZCA9IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNYXgpID8gbGltaXRzLnNwZWVkTWF4IDogTUlTU0lMRV9NQVhfU1BFRUQ7XG4gIGNvbnN0IG1pbkFncm8gPSBOdW1iZXIuaXNGaW5pdGUobGltaXRzLmFncm9NaW4pID8gbGltaXRzLmFncm9NaW4gOiBNSVNTSUxFX01JTl9BR1JPO1xuICBjb25zdCBiYXNlID0gZmFsbGJhY2sgPz8ge1xuICAgIHNwZWVkOiBtaW5TcGVlZCxcbiAgICBhZ3JvUmFkaXVzOiBtaW5BZ3JvLFxuICAgIGxpZmV0aW1lOiBtaXNzaWxlTGlmZXRpbWVGb3IobWluU3BlZWQsIG1pbkFncm8sIGxpbWl0cyksXG4gIH07XG4gIGNvbnN0IG1lcmdlZFNwZWVkID0gTnVtYmVyLmlzRmluaXRlKGNmZy5zcGVlZCA/PyBiYXNlLnNwZWVkKSA/IChjZmcuc3BlZWQgPz8gYmFzZS5zcGVlZCkgOiBiYXNlLnNwZWVkO1xuICBjb25zdCBtZXJnZWRBZ3JvID0gTnVtYmVyLmlzRmluaXRlKGNmZy5hZ3JvUmFkaXVzID8/IGJhc2UuYWdyb1JhZGl1cykgPyAoY2ZnLmFncm9SYWRpdXMgPz8gYmFzZS5hZ3JvUmFkaXVzKSA6IGJhc2UuYWdyb1JhZGl1cztcbiAgY29uc3Qgc3BlZWQgPSBjbGFtcChtZXJnZWRTcGVlZCwgbWluU3BlZWQsIG1heFNwZWVkKTtcbiAgY29uc3QgYWdyb1JhZGl1cyA9IE1hdGgubWF4KG1pbkFncm8sIG1lcmdlZEFncm8pO1xuICBjb25zdCBoZWF0UGFyYW1zID0gY2ZnLmhlYXRQYXJhbXMgPyB7IC4uLmNmZy5oZWF0UGFyYW1zIH0gOiBiYXNlLmhlYXRQYXJhbXMgPyB7IC4uLmJhc2UuaGVhdFBhcmFtcyB9IDogdW5kZWZpbmVkO1xuICByZXR1cm4ge1xuICAgIHNwZWVkLFxuICAgIGFncm9SYWRpdXMsXG4gICAgbGlmZXRpbWU6IG1pc3NpbGVMaWZldGltZUZvcihzcGVlZCwgYWdyb1JhZGl1cywgbGltaXRzKSxcbiAgICBoZWF0UGFyYW1zLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbW9ub3RvbmljTm93KCk6IG51bWJlciB7XG4gIGlmICh0eXBlb2YgcGVyZm9ybWFuY2UgIT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIHBlcmZvcm1hbmNlLm5vdyA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgcmV0dXJuIHBlcmZvcm1hbmNlLm5vdygpO1xuICB9XG4gIHJldHVybiBEYXRlLm5vdygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xvbmVXYXlwb2ludExpc3QobGlzdDogV2F5cG9pbnRbXSB8IHVuZGVmaW5lZCB8IG51bGwpOiBXYXlwb2ludFtdIHtcbiAgaWYgKCFBcnJheS5pc0FycmF5KGxpc3QpKSByZXR1cm4gW107XG4gIHJldHVybiBsaXN0Lm1hcCgod3ApID0+ICh7IC4uLndwIH0pKTtcbn1cblxuLy8gUHJvamVjdCBoZWF0IGFsb25nIGEgbWlzc2lsZSByb3V0ZVxuZXhwb3J0IGludGVyZmFjZSBNaXNzaWxlUm91dGVQcm9qZWN0aW9uIHtcbiAgd2F5cG9pbnRzOiBXYXlwb2ludFtdO1xuICBoZWF0QXRXYXlwb2ludHM6IG51bWJlcltdO1xuICB3aWxsT3ZlcmhlYXQ6IGJvb2xlYW47XG4gIG92ZXJoZWF0QXQ/OiBudW1iZXI7IC8vIEluZGV4IHdoZXJlIG92ZXJoZWF0IG9jY3Vyc1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvamVjdE1pc3NpbGVIZWF0KFxuICByb3V0ZTogV2F5cG9pbnRbXSxcbiAgZGVmYXVsdFNwZWVkOiBudW1iZXIsXG4gIGhlYXRQYXJhbXM6IEhlYXRQYXJhbXNcbik6IE1pc3NpbGVSb3V0ZVByb2plY3Rpb24ge1xuICBjb25zdCBwcm9qZWN0aW9uOiBNaXNzaWxlUm91dGVQcm9qZWN0aW9uID0ge1xuICAgIHdheXBvaW50czogcm91dGUsXG4gICAgaGVhdEF0V2F5cG9pbnRzOiBbXSxcbiAgICB3aWxsT3ZlcmhlYXQ6IGZhbHNlLFxuICB9O1xuXG4gIGlmIChyb3V0ZS5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gcHJvamVjdGlvbjtcbiAgfVxuXG4gIGxldCBoZWF0ID0gMDsgLy8gTWlzc2lsZXMgc3RhcnQgYXQgemVybyBoZWF0XG4gIGxldCBwb3MgPSB7IHg6IHJvdXRlWzBdLngsIHk6IHJvdXRlWzBdLnkgfTtcbiAgbGV0IGN1cnJlbnRTcGVlZCA9IHJvdXRlWzBdLnNwZWVkID4gMCA/IHJvdXRlWzBdLnNwZWVkIDogZGVmYXVsdFNwZWVkO1xuXG4gIHByb2plY3Rpb24uaGVhdEF0V2F5cG9pbnRzLnB1c2goaGVhdCk7XG5cbiAgZm9yIChsZXQgaSA9IDE7IGkgPCByb3V0ZS5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHRhcmdldFBvcyA9IHJvdXRlW2ldO1xuICAgIGNvbnN0IHRhcmdldFNwZWVkID0gdGFyZ2V0UG9zLnNwZWVkID4gMCA/IHRhcmdldFBvcy5zcGVlZCA6IGRlZmF1bHRTcGVlZDtcblxuICAgIC8vIENhbGN1bGF0ZSBkaXN0YW5jZSBhbmQgdGltZVxuICAgIGNvbnN0IGR4ID0gdGFyZ2V0UG9zLnggLSBwb3MueDtcbiAgICBjb25zdCBkeSA9IHRhcmdldFBvcy55IC0gcG9zLnk7XG4gICAgY29uc3QgZGlzdGFuY2UgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xuXG4gICAgaWYgKGRpc3RhbmNlIDwgMC4wMDEpIHtcbiAgICAgIHByb2plY3Rpb24uaGVhdEF0V2F5cG9pbnRzLnB1c2goaGVhdCk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyBBdmVyYWdlIHNwZWVkIGR1cmluZyBzZWdtZW50XG4gICAgY29uc3QgYXZnU3BlZWQgPSAoY3VycmVudFNwZWVkICsgdGFyZ2V0U3BlZWQpICogMC41O1xuICAgIGNvbnN0IHNlZ21lbnRUaW1lID0gZGlzdGFuY2UgLyBNYXRoLm1heChhdmdTcGVlZCwgMSk7XG5cbiAgICAvLyBDYWxjdWxhdGUgaGVhdCByYXRlIChtYXRjaCBzZXJ2ZXIgZm9ybXVsYSlcbiAgICBjb25zdCBWbiA9IE1hdGgubWF4KGhlYXRQYXJhbXMubWFya2VyU3BlZWQsIDAuMDAwMDAxKTtcbiAgICBjb25zdCBkZXYgPSBhdmdTcGVlZCAtIGhlYXRQYXJhbXMubWFya2VyU3BlZWQ7XG4gICAgY29uc3QgcCA9IGhlYXRQYXJhbXMuZXhwO1xuXG4gICAgbGV0IGhkb3Q6IG51bWJlcjtcbiAgICBpZiAoZGV2ID49IDApIHtcbiAgICAgIC8vIEhlYXRpbmdcbiAgICAgIGhkb3QgPSBoZWF0UGFyYW1zLmtVcCAqIE1hdGgucG93KGRldiAvIFZuLCBwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQ29vbGluZ1xuICAgICAgaGRvdCA9IC1oZWF0UGFyYW1zLmtEb3duICogTWF0aC5wb3coTWF0aC5hYnMoZGV2KSAvIFZuLCBwKTtcbiAgICB9XG5cbiAgICAvLyBVcGRhdGUgaGVhdFxuICAgIGhlYXQgKz0gaGRvdCAqIHNlZ21lbnRUaW1lO1xuICAgIGhlYXQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihoZWF0LCBoZWF0UGFyYW1zLm1heCkpO1xuXG4gICAgcHJvamVjdGlvbi5oZWF0QXRXYXlwb2ludHMucHVzaChoZWF0KTtcbiAgICBwb3MgPSB7IHg6IHRhcmdldFBvcy54LCB5OiB0YXJnZXRQb3MueSB9O1xuICAgIGN1cnJlbnRTcGVlZCA9IHRhcmdldFNwZWVkO1xuXG4gICAgLy8gQ2hlY2sgZm9yIG92ZXJoZWF0XG4gICAgaWYgKGhlYXQgPj0gaGVhdFBhcmFtcy5vdmVyaGVhdEF0ICYmICFwcm9qZWN0aW9uLndpbGxPdmVyaGVhdCkge1xuICAgICAgcHJvamVjdGlvbi53aWxsT3ZlcmhlYXQgPSB0cnVlO1xuICAgICAgcHJvamVjdGlvbi5vdmVyaGVhdEF0ID0gaTtcbiAgICB9XG5cbiAgICAvLyBVcGRhdGUgcG9zaXRpb24gYW5kIHNwZWVkXG4gICAgcG9zID0gdGFyZ2V0UG9zO1xuICAgIGN1cnJlbnRTcGVlZCA9IHRhcmdldFNwZWVkO1xuICB9XG5cbiAgcmV0dXJuIHByb2plY3Rpb247XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVNaXNzaWxlTGltaXRzKHN0YXRlOiBBcHBTdGF0ZSwgbGltaXRzOiBQYXJ0aWFsPE1pc3NpbGVMaW1pdHM+KTogdm9pZCB7XG4gIHN0YXRlLm1pc3NpbGVMaW1pdHMgPSB7XG4gICAgc3BlZWRNaW46IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNaW4pID8gbGltaXRzLnNwZWVkTWluISA6IHN0YXRlLm1pc3NpbGVMaW1pdHMuc3BlZWRNaW4sXG4gICAgc3BlZWRNYXg6IE51bWJlci5pc0Zpbml0ZShsaW1pdHMuc3BlZWRNYXgpID8gbGltaXRzLnNwZWVkTWF4ISA6IHN0YXRlLm1pc3NpbGVMaW1pdHMuc3BlZWRNYXgsXG4gICAgYWdyb01pbjogTnVtYmVyLmlzRmluaXRlKGxpbWl0cy5hZ3JvTWluKSA/IGxpbWl0cy5hZ3JvTWluISA6IHN0YXRlLm1pc3NpbGVMaW1pdHMuYWdyb01pbixcbiAgfTtcbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuLyoqXG4gKiBSZXR1cm4gYSBmdWxseS1xdWFsaWZpZWQgbmFtZSBmb3IgYSBQcm90b2J1ZiBkZXNjcmlwdG9yLlxuICogRm9yIGEgZmlsZSBkZXNjcmlwdG9yLCByZXR1cm4gdGhlIG9yaWdpbmFsIGZpbGUgcGF0aC5cbiAqXG4gKiBTZWUgaHR0cHM6Ly9wcm90b2J1Zi5jb20vZG9jcy9sYW5ndWFnZS1zcGVjI2Z1bGx5LXF1YWxpZmllZC1uYW1lc1xuICovXG5leHBvcnQgZnVuY3Rpb24gcXVhbGlmaWVkTmFtZShkZXNjKSB7XG4gICAgc3dpdGNoIChkZXNjLmtpbmQpIHtcbiAgICAgICAgY2FzZSBcImZpZWxkXCI6XG4gICAgICAgIGNhc2UgXCJvbmVvZlwiOlxuICAgICAgICBjYXNlIFwicnBjXCI6XG4gICAgICAgICAgICByZXR1cm4gZGVzYy5wYXJlbnQudHlwZU5hbWUgKyBcIi5cIiArIGRlc2MubmFtZTtcbiAgICAgICAgY2FzZSBcImVudW1fdmFsdWVcIjoge1xuICAgICAgICAgICAgY29uc3QgcCA9IGRlc2MucGFyZW50LnBhcmVudFxuICAgICAgICAgICAgICAgID8gZGVzYy5wYXJlbnQucGFyZW50LnR5cGVOYW1lXG4gICAgICAgICAgICAgICAgOiBkZXNjLnBhcmVudC5maWxlLnByb3RvLnBhY2thZ2U7XG4gICAgICAgICAgICByZXR1cm4gcCArIChwLmxlbmd0aCA+IDAgPyBcIi5cIiA6IFwiXCIpICsgZGVzYy5uYW1lO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgXCJzZXJ2aWNlXCI6XG4gICAgICAgIGNhc2UgXCJtZXNzYWdlXCI6XG4gICAgICAgIGNhc2UgXCJlbnVtXCI6XG4gICAgICAgIGNhc2UgXCJleHRlbnNpb25cIjpcbiAgICAgICAgICAgIHJldHVybiBkZXNjLnR5cGVOYW1lO1xuICAgICAgICBjYXNlIFwiZmlsZVwiOlxuICAgICAgICAgICAgcmV0dXJuIGRlc2MucHJvdG8ubmFtZTtcbiAgICB9XG59XG4vKipcbiAqIENvbnZlcnRzIHNuYWtlX2Nhc2UgdG8gcHJvdG9DYW1lbENhc2UgYWNjb3JkaW5nIHRvIHRoZSBjb252ZW50aW9uXG4gKiB1c2VkIGJ5IHByb3RvYyB0byBjb252ZXJ0IGEgZmllbGQgbmFtZSB0byBhIEpTT04gbmFtZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByb3RvQ2FtZWxDYXNlKHNuYWtlQ2FzZSkge1xuICAgIGxldCBjYXBOZXh0ID0gZmFsc2U7XG4gICAgY29uc3QgYiA9IFtdO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc25ha2VDYXNlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGxldCBjID0gc25ha2VDYXNlLmNoYXJBdChpKTtcbiAgICAgICAgc3dpdGNoIChjKSB7XG4gICAgICAgICAgICBjYXNlIFwiX1wiOlxuICAgICAgICAgICAgICAgIGNhcE5leHQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcIjBcIjpcbiAgICAgICAgICAgIGNhc2UgXCIxXCI6XG4gICAgICAgICAgICBjYXNlIFwiMlwiOlxuICAgICAgICAgICAgY2FzZSBcIjNcIjpcbiAgICAgICAgICAgIGNhc2UgXCI0XCI6XG4gICAgICAgICAgICBjYXNlIFwiNVwiOlxuICAgICAgICAgICAgY2FzZSBcIjZcIjpcbiAgICAgICAgICAgIGNhc2UgXCI3XCI6XG4gICAgICAgICAgICBjYXNlIFwiOFwiOlxuICAgICAgICAgICAgY2FzZSBcIjlcIjpcbiAgICAgICAgICAgICAgICBiLnB1c2goYyk7XG4gICAgICAgICAgICAgICAgY2FwTmV4dCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICBpZiAoY2FwTmV4dCkge1xuICAgICAgICAgICAgICAgICAgICBjYXBOZXh0ID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGMgPSBjLnRvVXBwZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGIucHVzaChjKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYi5qb2luKFwiXCIpO1xufVxuLyoqXG4gKiBOYW1lcyB0aGF0IGNhbm5vdCBiZSB1c2VkIGZvciBvYmplY3QgcHJvcGVydGllcyBiZWNhdXNlIHRoZXkgYXJlIHJlc2VydmVkXG4gKiBieSBidWlsdC1pbiBKYXZhU2NyaXB0IHByb3BlcnRpZXMuXG4gKi9cbmNvbnN0IHJlc2VydmVkT2JqZWN0UHJvcGVydGllcyA9IG5ldyBTZXQoW1xuICAgIC8vIG5hbWVzIHJlc2VydmVkIGJ5IEphdmFTY3JpcHRcbiAgICBcImNvbnN0cnVjdG9yXCIsXG4gICAgXCJ0b1N0cmluZ1wiLFxuICAgIFwidG9KU09OXCIsXG4gICAgXCJ2YWx1ZU9mXCIsXG5dKTtcbi8qKlxuICogRXNjYXBlcyBuYW1lcyB0aGF0IGFyZSByZXNlcnZlZCBmb3IgRUNNQVNjcmlwdCBidWlsdC1pbiBvYmplY3QgcHJvcGVydGllcy5cbiAqXG4gKiBBbHNvIHNlZSBzYWZlSWRlbnRpZmllcigpIGZyb20gQGJ1ZmJ1aWxkL3Byb3RvcGx1Z2luLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2FmZU9iamVjdFByb3BlcnR5KG5hbWUpIHtcbiAgICByZXR1cm4gcmVzZXJ2ZWRPYmplY3RQcm9wZXJ0aWVzLmhhcyhuYW1lKSA/IG5hbWUgKyBcIiRcIiA6IG5hbWU7XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMDggR29vZ2xlIEluYy4gIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4vL1xuLy8gUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4vLyBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlXG4vLyBtZXQ6XG4vL1xuLy8gKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodFxuLy8gbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuLy8gKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlXG4vLyBjb3B5cmlnaHQgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyXG4vLyBpbiB0aGUgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlXG4vLyBkaXN0cmlidXRpb24uXG4vLyAqIE5laXRoZXIgdGhlIG5hbWUgb2YgR29vZ2xlIEluYy4gbm9yIHRoZSBuYW1lcyBvZiBpdHNcbi8vIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHMgZGVyaXZlZCBmcm9tXG4vLyB0aGlzIHNvZnR3YXJlIHdpdGhvdXQgc3BlY2lmaWMgcHJpb3Igd3JpdHRlbiBwZXJtaXNzaW9uLlxuLy9cbi8vIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlNcbi8vIFwiQVMgSVNcIiBBTkQgQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1Rcbi8vIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUlxuLy8gQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBDT1BZUklHSFRcbi8vIE9XTkVSIE9SIENPTlRSSUJVVE9SUyBCRSBMSUFCTEUgRk9SIEFOWSBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLFxuLy8gU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVMgKElOQ0xVRElORywgQlVUIE5PVFxuLy8gTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUzsgTE9TUyBPRiBVU0UsXG4vLyBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORCBPTiBBTllcbi8vIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbi8vIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRVxuLy8gT0YgVEhJUyBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbi8vXG4vLyBDb2RlIGdlbmVyYXRlZCBieSB0aGUgUHJvdG9jb2wgQnVmZmVyIGNvbXBpbGVyIGlzIG93bmVkIGJ5IHRoZSBvd25lclxuLy8gb2YgdGhlIGlucHV0IGZpbGUgdXNlZCB3aGVuIGdlbmVyYXRpbmcgaXQuICBUaGlzIGNvZGUgaXMgbm90XG4vLyBzdGFuZGFsb25lIGFuZCByZXF1aXJlcyBhIHN1cHBvcnQgbGlicmFyeSB0byBiZSBsaW5rZWQgd2l0aCBpdC4gIFRoaXNcbi8vIHN1cHBvcnQgbGlicmFyeSBpcyBpdHNlbGYgY292ZXJlZCBieSB0aGUgYWJvdmUgbGljZW5zZS5cbi8qKlxuICogUmVhZCBhIDY0IGJpdCB2YXJpbnQgYXMgdHdvIEpTIG51bWJlcnMuXG4gKlxuICogUmV0dXJucyB0dXBsZTpcbiAqIFswXTogbG93IGJpdHNcbiAqIFsxXTogaGlnaCBiaXRzXG4gKlxuICogQ29weXJpZ2h0IDIwMDggR29vZ2xlIEluYy4gIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9wcm90b2NvbGJ1ZmZlcnMvcHJvdG9idWYvYmxvYi84YTcxOTI3ZDc0YTRjZTM0ZWZlMmQ4NzY5ZmRhMTk4ZjUyZDIwZDEyL2pzL2V4cGVyaW1lbnRhbC9ydW50aW1lL2tlcm5lbC9idWZmZXJfZGVjb2Rlci5qcyNMMTc1XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB2YXJpbnQ2NHJlYWQoKSB7XG4gICAgbGV0IGxvd0JpdHMgPSAwO1xuICAgIGxldCBoaWdoQml0cyA9IDA7XG4gICAgZm9yIChsZXQgc2hpZnQgPSAwOyBzaGlmdCA8IDI4OyBzaGlmdCArPSA3KSB7XG4gICAgICAgIGxldCBiID0gdGhpcy5idWZbdGhpcy5wb3MrK107XG4gICAgICAgIGxvd0JpdHMgfD0gKGIgJiAweDdmKSA8PCBzaGlmdDtcbiAgICAgICAgaWYgKChiICYgMHg4MCkgPT0gMCkge1xuICAgICAgICAgICAgdGhpcy5hc3NlcnRCb3VuZHMoKTtcbiAgICAgICAgICAgIHJldHVybiBbbG93Qml0cywgaGlnaEJpdHNdO1xuICAgICAgICB9XG4gICAgfVxuICAgIGxldCBtaWRkbGVCeXRlID0gdGhpcy5idWZbdGhpcy5wb3MrK107XG4gICAgLy8gbGFzdCBmb3VyIGJpdHMgb2YgdGhlIGZpcnN0IDMyIGJpdCBudW1iZXJcbiAgICBsb3dCaXRzIHw9IChtaWRkbGVCeXRlICYgMHgwZikgPDwgMjg7XG4gICAgLy8gMyB1cHBlciBiaXRzIGFyZSBwYXJ0IG9mIHRoZSBuZXh0IDMyIGJpdCBudW1iZXJcbiAgICBoaWdoQml0cyA9IChtaWRkbGVCeXRlICYgMHg3MCkgPj4gNDtcbiAgICBpZiAoKG1pZGRsZUJ5dGUgJiAweDgwKSA9PSAwKSB7XG4gICAgICAgIHRoaXMuYXNzZXJ0Qm91bmRzKCk7XG4gICAgICAgIHJldHVybiBbbG93Qml0cywgaGlnaEJpdHNdO1xuICAgIH1cbiAgICBmb3IgKGxldCBzaGlmdCA9IDM7IHNoaWZ0IDw9IDMxOyBzaGlmdCArPSA3KSB7XG4gICAgICAgIGxldCBiID0gdGhpcy5idWZbdGhpcy5wb3MrK107XG4gICAgICAgIGhpZ2hCaXRzIHw9IChiICYgMHg3ZikgPDwgc2hpZnQ7XG4gICAgICAgIGlmICgoYiAmIDB4ODApID09IDApIHtcbiAgICAgICAgICAgIHRoaXMuYXNzZXJ0Qm91bmRzKCk7XG4gICAgICAgICAgICByZXR1cm4gW2xvd0JpdHMsIGhpZ2hCaXRzXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbnZhbGlkIHZhcmludFwiKTtcbn1cbi8qKlxuICogV3JpdGUgYSA2NCBiaXQgdmFyaW50LCBnaXZlbiBhcyB0d28gSlMgbnVtYmVycywgdG8gdGhlIGdpdmVuIGJ5dGVzIGFycmF5LlxuICpcbiAqIENvcHlyaWdodCAyMDA4IEdvb2dsZSBJbmMuICBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICpcbiAqIFNlZSBodHRwczovL2dpdGh1Yi5jb20vcHJvdG9jb2xidWZmZXJzL3Byb3RvYnVmL2Jsb2IvOGE3MTkyN2Q3NGE0Y2UzNGVmZTJkODc2OWZkYTE5OGY1MmQyMGQxMi9qcy9leHBlcmltZW50YWwvcnVudGltZS9rZXJuZWwvd3JpdGVyLmpzI0wzNDRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhcmludDY0d3JpdGUobG8sIGhpLCBieXRlcykge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgMjg7IGkgPSBpICsgNykge1xuICAgICAgICBjb25zdCBzaGlmdCA9IGxvID4+PiBpO1xuICAgICAgICBjb25zdCBoYXNOZXh0ID0gIShzaGlmdCA+Pj4gNyA9PSAwICYmIGhpID09IDApO1xuICAgICAgICBjb25zdCBieXRlID0gKGhhc05leHQgPyBzaGlmdCB8IDB4ODAgOiBzaGlmdCkgJiAweGZmO1xuICAgICAgICBieXRlcy5wdXNoKGJ5dGUpO1xuICAgICAgICBpZiAoIWhhc05leHQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBzcGxpdEJpdHMgPSAoKGxvID4+PiAyOCkgJiAweDBmKSB8ICgoaGkgJiAweDA3KSA8PCA0KTtcbiAgICBjb25zdCBoYXNNb3JlQml0cyA9ICEoaGkgPj4gMyA9PSAwKTtcbiAgICBieXRlcy5wdXNoKChoYXNNb3JlQml0cyA/IHNwbGl0Qml0cyB8IDB4ODAgOiBzcGxpdEJpdHMpICYgMHhmZik7XG4gICAgaWYgKCFoYXNNb3JlQml0cykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGZvciAobGV0IGkgPSAzOyBpIDwgMzE7IGkgPSBpICsgNykge1xuICAgICAgICBjb25zdCBzaGlmdCA9IGhpID4+PiBpO1xuICAgICAgICBjb25zdCBoYXNOZXh0ID0gIShzaGlmdCA+Pj4gNyA9PSAwKTtcbiAgICAgICAgY29uc3QgYnl0ZSA9IChoYXNOZXh0ID8gc2hpZnQgfCAweDgwIDogc2hpZnQpICYgMHhmZjtcbiAgICAgICAgYnl0ZXMucHVzaChieXRlKTtcbiAgICAgICAgaWYgKCFoYXNOZXh0KSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICB9XG4gICAgYnl0ZXMucHVzaCgoaGkgPj4+IDMxKSAmIDB4MDEpO1xufVxuLy8gY29uc3RhbnRzIGZvciBiaW5hcnkgbWF0aFxuY29uc3QgVFdPX1BXUl8zMl9EQkwgPSAweDEwMDAwMDAwMDtcbi8qKlxuICogUGFyc2UgZGVjaW1hbCBzdHJpbmcgb2YgNjQgYml0IGludGVnZXIgdmFsdWUgYXMgdHdvIEpTIG51bWJlcnMuXG4gKlxuICogQ29weXJpZ2h0IDIwMDggR29vZ2xlIEluYy4gIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9wcm90b2NvbGJ1ZmZlcnMvcHJvdG9idWYtamF2YXNjcmlwdC9ibG9iL2E0MjhjNTgyNzNhYmFkMDdjNjYwNzFkOTc1M2JjNGQxMjg5ZGU0MjYvZXhwZXJpbWVudGFsL3J1bnRpbWUvaW50NjQuanMjTDEwXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbnQ2NEZyb21TdHJpbmcoZGVjKSB7XG4gICAgLy8gQ2hlY2sgZm9yIG1pbnVzIHNpZ24uXG4gICAgY29uc3QgbWludXMgPSBkZWNbMF0gPT09IFwiLVwiO1xuICAgIGlmIChtaW51cykge1xuICAgICAgICBkZWMgPSBkZWMuc2xpY2UoMSk7XG4gICAgfVxuICAgIC8vIFdvcmsgNiBkZWNpbWFsIGRpZ2l0cyBhdCBhIHRpbWUsIGFjdGluZyBsaWtlIHdlJ3JlIGNvbnZlcnRpbmcgYmFzZSAxZTZcbiAgICAvLyBkaWdpdHMgdG8gYmluYXJ5LiBUaGlzIGlzIHNhZmUgdG8gZG8gd2l0aCBmbG9hdGluZyBwb2ludCBtYXRoIGJlY2F1c2VcbiAgICAvLyBOdW1iZXIuaXNTYWZlSW50ZWdlcihBTExfMzJfQklUUyAqIDFlNikgPT0gdHJ1ZS5cbiAgICBjb25zdCBiYXNlID0gMWU2O1xuICAgIGxldCBsb3dCaXRzID0gMDtcbiAgICBsZXQgaGlnaEJpdHMgPSAwO1xuICAgIGZ1bmN0aW9uIGFkZDFlNmRpZ2l0KGJlZ2luLCBlbmQpIHtcbiAgICAgICAgLy8gTm90ZTogTnVtYmVyKCcnKSBpcyAwLlxuICAgICAgICBjb25zdCBkaWdpdDFlNiA9IE51bWJlcihkZWMuc2xpY2UoYmVnaW4sIGVuZCkpO1xuICAgICAgICBoaWdoQml0cyAqPSBiYXNlO1xuICAgICAgICBsb3dCaXRzID0gbG93Qml0cyAqIGJhc2UgKyBkaWdpdDFlNjtcbiAgICAgICAgLy8gQ2FycnkgYml0cyBmcm9tIGxvd0JpdHMgdG9cbiAgICAgICAgaWYgKGxvd0JpdHMgPj0gVFdPX1BXUl8zMl9EQkwpIHtcbiAgICAgICAgICAgIGhpZ2hCaXRzID0gaGlnaEJpdHMgKyAoKGxvd0JpdHMgLyBUV09fUFdSXzMyX0RCTCkgfCAwKTtcbiAgICAgICAgICAgIGxvd0JpdHMgPSBsb3dCaXRzICUgVFdPX1BXUl8zMl9EQkw7XG4gICAgICAgIH1cbiAgICB9XG4gICAgYWRkMWU2ZGlnaXQoLTI0LCAtMTgpO1xuICAgIGFkZDFlNmRpZ2l0KC0xOCwgLTEyKTtcbiAgICBhZGQxZTZkaWdpdCgtMTIsIC02KTtcbiAgICBhZGQxZTZkaWdpdCgtNik7XG4gICAgcmV0dXJuIG1pbnVzID8gbmVnYXRlKGxvd0JpdHMsIGhpZ2hCaXRzKSA6IG5ld0JpdHMobG93Qml0cywgaGlnaEJpdHMpO1xufVxuLyoqXG4gKiBMb3NzbGVzc2x5IGNvbnZlcnRzIGEgNjQtYml0IHNpZ25lZCBpbnRlZ2VyIGluIDMyOjMyIHNwbGl0IHJlcHJlc2VudGF0aW9uXG4gKiBpbnRvIGEgZGVjaW1hbCBzdHJpbmcuXG4gKlxuICogQ29weXJpZ2h0IDIwMDggR29vZ2xlIEluYy4gIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9wcm90b2NvbGJ1ZmZlcnMvcHJvdG9idWYtamF2YXNjcmlwdC9ibG9iL2E0MjhjNTgyNzNhYmFkMDdjNjYwNzFkOTc1M2JjNGQxMjg5ZGU0MjYvZXhwZXJpbWVudGFsL3J1bnRpbWUvaW50NjQuanMjTDEwXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbnQ2NFRvU3RyaW5nKGxvLCBoaSkge1xuICAgIGxldCBiaXRzID0gbmV3Qml0cyhsbywgaGkpO1xuICAgIC8vIElmIHdlJ3JlIHRyZWF0aW5nIHRoZSBpbnB1dCBhcyBhIHNpZ25lZCB2YWx1ZSBhbmQgdGhlIGhpZ2ggYml0IGlzIHNldCwgZG9cbiAgICAvLyBhIG1hbnVhbCB0d28ncyBjb21wbGVtZW50IGNvbnZlcnNpb24gYmVmb3JlIHRoZSBkZWNpbWFsIGNvbnZlcnNpb24uXG4gICAgY29uc3QgbmVnYXRpdmUgPSBiaXRzLmhpICYgMHg4MDAwMDAwMDtcbiAgICBpZiAobmVnYXRpdmUpIHtcbiAgICAgICAgYml0cyA9IG5lZ2F0ZShiaXRzLmxvLCBiaXRzLmhpKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0ID0gdUludDY0VG9TdHJpbmcoYml0cy5sbywgYml0cy5oaSk7XG4gICAgcmV0dXJuIG5lZ2F0aXZlID8gXCItXCIgKyByZXN1bHQgOiByZXN1bHQ7XG59XG4vKipcbiAqIExvc3NsZXNzbHkgY29udmVydHMgYSA2NC1iaXQgdW5zaWduZWQgaW50ZWdlciBpbiAzMjozMiBzcGxpdCByZXByZXNlbnRhdGlvblxuICogaW50byBhIGRlY2ltYWwgc3RyaW5nLlxuICpcbiAqIENvcHlyaWdodCAyMDA4IEdvb2dsZSBJbmMuICBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICpcbiAqIFNlZSBodHRwczovL2dpdGh1Yi5jb20vcHJvdG9jb2xidWZmZXJzL3Byb3RvYnVmLWphdmFzY3JpcHQvYmxvYi9hNDI4YzU4MjczYWJhZDA3YzY2MDcxZDk3NTNiYzRkMTI4OWRlNDI2L2V4cGVyaW1lbnRhbC9ydW50aW1lL2ludDY0LmpzI0wxMFxuICovXG5leHBvcnQgZnVuY3Rpb24gdUludDY0VG9TdHJpbmcobG8sIGhpKSB7XG4gICAgKHsgbG8sIGhpIH0gPSB0b1Vuc2lnbmVkKGxvLCBoaSkpO1xuICAgIC8vIFNraXAgdGhlIGV4cGVuc2l2ZSBjb252ZXJzaW9uIGlmIHRoZSBudW1iZXIgaXMgc21hbGwgZW5vdWdoIHRvIHVzZSB0aGVcbiAgICAvLyBidWlsdC1pbiBjb252ZXJzaW9ucy5cbiAgICAvLyBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiA9IDB4MDAxRkZGRkYgRkZGRkZGRkYsIHRodXMgYW55IG51bWJlciB3aXRoXG4gICAgLy8gaGlnaEJpdHMgPD0gMHgxRkZGRkYgY2FuIGJlIHNhZmVseSBleHByZXNzZWQgd2l0aCBhIGRvdWJsZSBhbmQgcmV0YWluXG4gICAgLy8gaW50ZWdlciBwcmVjaXNpb24uXG4gICAgLy8gUHJvdmVuIGJ5OiBOdW1iZXIuaXNTYWZlSW50ZWdlcigweDFGRkZGRiAqIDIqKjMyICsgMHhGRkZGRkZGRikgPT0gdHJ1ZS5cbiAgICBpZiAoaGkgPD0gMHgxZmZmZmYpIHtcbiAgICAgICAgcmV0dXJuIFN0cmluZyhUV09fUFdSXzMyX0RCTCAqIGhpICsgbG8pO1xuICAgIH1cbiAgICAvLyBXaGF0IHRoaXMgY29kZSBpcyBkb2luZyBpcyBlc3NlbnRpYWxseSBjb252ZXJ0aW5nIHRoZSBpbnB1dCBudW1iZXIgZnJvbVxuICAgIC8vIGJhc2UtMiB0byBiYXNlLTFlNywgd2hpY2ggYWxsb3dzIHVzIHRvIHJlcHJlc2VudCB0aGUgNjQtYml0IHJhbmdlIHdpdGhcbiAgICAvLyBvbmx5IDMgKHZlcnkgbGFyZ2UpIGRpZ2l0cy4gVGhvc2UgZGlnaXRzIGFyZSB0aGVuIHRyaXZpYWwgdG8gY29udmVydCB0b1xuICAgIC8vIGEgYmFzZS0xMCBzdHJpbmcuXG4gICAgLy8gVGhlIG1hZ2ljIG51bWJlcnMgdXNlZCBoZXJlIGFyZSAtXG4gICAgLy8gMl4yNCA9IDE2Nzc3MjE2ID0gKDEsNjc3NzIxNikgaW4gYmFzZS0xZTcuXG4gICAgLy8gMl40OCA9IDI4MTQ3NDk3NjcxMDY1NiA9ICgyLDgxNDc0OTcsNjcxMDY1NikgaW4gYmFzZS0xZTcuXG4gICAgLy8gU3BsaXQgMzI6MzIgcmVwcmVzZW50YXRpb24gaW50byAxNjoyNDoyNCByZXByZXNlbnRhdGlvbiBzbyBvdXJcbiAgICAvLyBpbnRlcm1lZGlhdGUgZGlnaXRzIGRvbid0IG92ZXJmbG93LlxuICAgIGNvbnN0IGxvdyA9IGxvICYgMHhmZmZmZmY7XG4gICAgY29uc3QgbWlkID0gKChsbyA+Pj4gMjQpIHwgKGhpIDw8IDgpKSAmIDB4ZmZmZmZmO1xuICAgIGNvbnN0IGhpZ2ggPSAoaGkgPj4gMTYpICYgMHhmZmZmO1xuICAgIC8vIEFzc2VtYmxlIG91ciB0aHJlZSBiYXNlLTFlNyBkaWdpdHMsIGlnbm9yaW5nIGNhcnJpZXMuIFRoZSBtYXhpbXVtXG4gICAgLy8gdmFsdWUgaW4gYSBkaWdpdCBhdCB0aGlzIHN0ZXAgaXMgcmVwcmVzZW50YWJsZSBhcyBhIDQ4LWJpdCBpbnRlZ2VyLCB3aGljaFxuICAgIC8vIGNhbiBiZSBzdG9yZWQgaW4gYSA2NC1iaXQgZmxvYXRpbmcgcG9pbnQgbnVtYmVyLlxuICAgIGxldCBkaWdpdEEgPSBsb3cgKyBtaWQgKiA2Nzc3MjE2ICsgaGlnaCAqIDY3MTA2NTY7XG4gICAgbGV0IGRpZ2l0QiA9IG1pZCArIGhpZ2ggKiA4MTQ3NDk3O1xuICAgIGxldCBkaWdpdEMgPSBoaWdoICogMjtcbiAgICAvLyBBcHBseSBjYXJyaWVzIGZyb20gQSB0byBCIGFuZCBmcm9tIEIgdG8gQy5cbiAgICBjb25zdCBiYXNlID0gMTAwMDAwMDA7XG4gICAgaWYgKGRpZ2l0QSA+PSBiYXNlKSB7XG4gICAgICAgIGRpZ2l0QiArPSBNYXRoLmZsb29yKGRpZ2l0QSAvIGJhc2UpO1xuICAgICAgICBkaWdpdEEgJT0gYmFzZTtcbiAgICB9XG4gICAgaWYgKGRpZ2l0QiA+PSBiYXNlKSB7XG4gICAgICAgIGRpZ2l0QyArPSBNYXRoLmZsb29yKGRpZ2l0QiAvIGJhc2UpO1xuICAgICAgICBkaWdpdEIgJT0gYmFzZTtcbiAgICB9XG4gICAgLy8gSWYgZGlnaXRDIGlzIDAsIHRoZW4gd2Ugc2hvdWxkIGhhdmUgcmV0dXJuZWQgaW4gdGhlIHRyaXZpYWwgY29kZSBwYXRoXG4gICAgLy8gYXQgdGhlIHRvcCBmb3Igbm9uLXNhZmUgaW50ZWdlcnMuIEdpdmVuIHRoaXMsIHdlIGNhbiBhc3N1bWUgYm90aCBkaWdpdEJcbiAgICAvLyBhbmQgZGlnaXRBIG5lZWQgbGVhZGluZyB6ZXJvcy5cbiAgICByZXR1cm4gKGRpZ2l0Qy50b1N0cmluZygpICtcbiAgICAgICAgZGVjaW1hbEZyb20xZTdXaXRoTGVhZGluZ1plcm9zKGRpZ2l0QikgK1xuICAgICAgICBkZWNpbWFsRnJvbTFlN1dpdGhMZWFkaW5nWmVyb3MoZGlnaXRBKSk7XG59XG5mdW5jdGlvbiB0b1Vuc2lnbmVkKGxvLCBoaSkge1xuICAgIHJldHVybiB7IGxvOiBsbyA+Pj4gMCwgaGk6IGhpID4+PiAwIH07XG59XG5mdW5jdGlvbiBuZXdCaXRzKGxvLCBoaSkge1xuICAgIHJldHVybiB7IGxvOiBsbyB8IDAsIGhpOiBoaSB8IDAgfTtcbn1cbi8qKlxuICogUmV0dXJucyB0d28ncyBjb21wbGltZW50IG5lZ2F0aW9uIG9mIGlucHV0LlxuICogQHNlZSBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9PcGVyYXRvcnMvQml0d2lzZV9PcGVyYXRvcnMjU2lnbmVkXzMyLWJpdF9pbnRlZ2Vyc1xuICovXG5mdW5jdGlvbiBuZWdhdGUobG93Qml0cywgaGlnaEJpdHMpIHtcbiAgICBoaWdoQml0cyA9IH5oaWdoQml0cztcbiAgICBpZiAobG93Qml0cykge1xuICAgICAgICBsb3dCaXRzID0gfmxvd0JpdHMgKyAxO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgLy8gSWYgbG93Qml0cyBpcyAwLCB0aGVuIGJpdHdpc2Utbm90IGlzIDB4RkZGRkZGRkYsXG4gICAgICAgIC8vIGFkZGluZyAxIHRvIHRoYXQsIHJlc3VsdHMgaW4gMHgxMDAwMDAwMDAsIHdoaWNoIGxlYXZlc1xuICAgICAgICAvLyB0aGUgbG93IGJpdHMgMHgwIGFuZCBzaW1wbHkgYWRkcyBvbmUgdG8gdGhlIGhpZ2ggYml0cy5cbiAgICAgICAgaGlnaEJpdHMgKz0gMTtcbiAgICB9XG4gICAgcmV0dXJuIG5ld0JpdHMobG93Qml0cywgaGlnaEJpdHMpO1xufVxuLyoqXG4gKiBSZXR1cm5zIGRlY2ltYWwgcmVwcmVzZW50YXRpb24gb2YgZGlnaXQxZTcgd2l0aCBsZWFkaW5nIHplcm9zLlxuICovXG5jb25zdCBkZWNpbWFsRnJvbTFlN1dpdGhMZWFkaW5nWmVyb3MgPSAoZGlnaXQxZTcpID0+IHtcbiAgICBjb25zdCBwYXJ0aWFsID0gU3RyaW5nKGRpZ2l0MWU3KTtcbiAgICByZXR1cm4gXCIwMDAwMDAwXCIuc2xpY2UocGFydGlhbC5sZW5ndGgpICsgcGFydGlhbDtcbn07XG4vKipcbiAqIFdyaXRlIGEgMzIgYml0IHZhcmludCwgc2lnbmVkIG9yIHVuc2lnbmVkLiBTYW1lIGFzIGB2YXJpbnQ2NHdyaXRlKDAsIHZhbHVlLCBieXRlcylgXG4gKlxuICogQ29weXJpZ2h0IDIwMDggR29vZ2xlIEluYy4gIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9wcm90b2NvbGJ1ZmZlcnMvcHJvdG9idWYvYmxvYi8xYjE4ODMzZjRmMmEyZjY4MWY0ZTRhMjVjZGYzYjBhNDMxMTVlYzI2L2pzL2JpbmFyeS9lbmNvZGVyLmpzI0wxNDRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhcmludDMyd3JpdGUodmFsdWUsIGJ5dGVzKSB7XG4gICAgaWYgKHZhbHVlID49IDApIHtcbiAgICAgICAgLy8gd3JpdGUgdmFsdWUgYXMgdmFyaW50IDMyXG4gICAgICAgIHdoaWxlICh2YWx1ZSA+IDB4N2YpIHtcbiAgICAgICAgICAgIGJ5dGVzLnB1c2goKHZhbHVlICYgMHg3ZikgfCAweDgwKTtcbiAgICAgICAgICAgIHZhbHVlID0gdmFsdWUgPj4+IDc7XG4gICAgICAgIH1cbiAgICAgICAgYnl0ZXMucHVzaCh2YWx1ZSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDk7IGkrKykge1xuICAgICAgICAgICAgYnl0ZXMucHVzaCgodmFsdWUgJiAxMjcpIHwgMTI4KTtcbiAgICAgICAgICAgIHZhbHVlID0gdmFsdWUgPj4gNztcbiAgICAgICAgfVxuICAgICAgICBieXRlcy5wdXNoKDEpO1xuICAgIH1cbn1cbi8qKlxuICogUmVhZCBhbiB1bnNpZ25lZCAzMiBiaXQgdmFyaW50LlxuICpcbiAqIFNlZSBodHRwczovL2dpdGh1Yi5jb20vcHJvdG9jb2xidWZmZXJzL3Byb3RvYnVmL2Jsb2IvOGE3MTkyN2Q3NGE0Y2UzNGVmZTJkODc2OWZkYTE5OGY1MmQyMGQxMi9qcy9leHBlcmltZW50YWwvcnVudGltZS9rZXJuZWwvYnVmZmVyX2RlY29kZXIuanMjTDIyMFxuICovXG5leHBvcnQgZnVuY3Rpb24gdmFyaW50MzJyZWFkKCkge1xuICAgIGxldCBiID0gdGhpcy5idWZbdGhpcy5wb3MrK107XG4gICAgbGV0IHJlc3VsdCA9IGIgJiAweDdmO1xuICAgIGlmICgoYiAmIDB4ODApID09IDApIHtcbiAgICAgICAgdGhpcy5hc3NlcnRCb3VuZHMoKTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgYiA9IHRoaXMuYnVmW3RoaXMucG9zKytdO1xuICAgIHJlc3VsdCB8PSAoYiAmIDB4N2YpIDw8IDc7XG4gICAgaWYgKChiICYgMHg4MCkgPT0gMCkge1xuICAgICAgICB0aGlzLmFzc2VydEJvdW5kcygpO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICBiID0gdGhpcy5idWZbdGhpcy5wb3MrK107XG4gICAgcmVzdWx0IHw9IChiICYgMHg3ZikgPDwgMTQ7XG4gICAgaWYgKChiICYgMHg4MCkgPT0gMCkge1xuICAgICAgICB0aGlzLmFzc2VydEJvdW5kcygpO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICBiID0gdGhpcy5idWZbdGhpcy5wb3MrK107XG4gICAgcmVzdWx0IHw9IChiICYgMHg3ZikgPDwgMjE7XG4gICAgaWYgKChiICYgMHg4MCkgPT0gMCkge1xuICAgICAgICB0aGlzLmFzc2VydEJvdW5kcygpO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICAvLyBFeHRyYWN0IG9ubHkgbGFzdCA0IGJpdHNcbiAgICBiID0gdGhpcy5idWZbdGhpcy5wb3MrK107XG4gICAgcmVzdWx0IHw9IChiICYgMHgwZikgPDwgMjg7XG4gICAgZm9yIChsZXQgcmVhZEJ5dGVzID0gNTsgKGIgJiAweDgwKSAhPT0gMCAmJiByZWFkQnl0ZXMgPCAxMDsgcmVhZEJ5dGVzKyspXG4gICAgICAgIGIgPSB0aGlzLmJ1Zlt0aGlzLnBvcysrXTtcbiAgICBpZiAoKGIgJiAweDgwKSAhPSAwKVxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbnZhbGlkIHZhcmludFwiKTtcbiAgICB0aGlzLmFzc2VydEJvdW5kcygpO1xuICAgIC8vIFJlc3VsdCBjYW4gaGF2ZSAzMiBiaXRzLCBjb252ZXJ0IGl0IHRvIHVuc2lnbmVkXG4gICAgcmV0dXJuIHJlc3VsdCA+Pj4gMDtcbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuaW1wb3J0IHsgaW50NjRGcm9tU3RyaW5nLCBpbnQ2NFRvU3RyaW5nLCB1SW50NjRUb1N0cmluZywgfSBmcm9tIFwiLi93aXJlL3ZhcmludC5qc1wiO1xuLyoqXG4gKiBJbnQ2NFN1cHBvcnQgZm9yIHRoZSBjdXJyZW50IGVudmlyb25tZW50LlxuICovXG5leHBvcnQgY29uc3QgcHJvdG9JbnQ2NCA9IC8qQF9fUFVSRV9fKi8gbWFrZUludDY0U3VwcG9ydCgpO1xuZnVuY3Rpb24gbWFrZUludDY0U3VwcG9ydCgpIHtcbiAgICBjb25zdCBkdiA9IG5ldyBEYXRhVmlldyhuZXcgQXJyYXlCdWZmZXIoOCkpO1xuICAgIC8vIG5vdGUgdGhhdCBTYWZhcmkgMTQgaW1wbGVtZW50cyBCaWdJbnQsIGJ1dCBub3QgdGhlIERhdGFWaWV3IG1ldGhvZHNcbiAgICBjb25zdCBvayA9IHR5cGVvZiBCaWdJbnQgPT09IFwiZnVuY3Rpb25cIiAmJlxuICAgICAgICB0eXBlb2YgZHYuZ2V0QmlnSW50NjQgPT09IFwiZnVuY3Rpb25cIiAmJlxuICAgICAgICB0eXBlb2YgZHYuZ2V0QmlnVWludDY0ID09PSBcImZ1bmN0aW9uXCIgJiZcbiAgICAgICAgdHlwZW9mIGR2LnNldEJpZ0ludDY0ID09PSBcImZ1bmN0aW9uXCIgJiZcbiAgICAgICAgdHlwZW9mIGR2LnNldEJpZ1VpbnQ2NCA9PT0gXCJmdW5jdGlvblwiICYmXG4gICAgICAgICghIWdsb2JhbFRoaXMuRGVubyB8fFxuICAgICAgICAgICAgdHlwZW9mIHByb2Nlc3MgIT0gXCJvYmplY3RcIiB8fFxuICAgICAgICAgICAgdHlwZW9mIHByb2Nlc3MuZW52ICE9IFwib2JqZWN0XCIgfHxcbiAgICAgICAgICAgIHByb2Nlc3MuZW52LkJVRl9CSUdJTlRfRElTQUJMRSAhPT0gXCIxXCIpO1xuICAgIGlmIChvaykge1xuICAgICAgICBjb25zdCBNSU4gPSBCaWdJbnQoXCItOTIyMzM3MjAzNjg1NDc3NTgwOFwiKTtcbiAgICAgICAgY29uc3QgTUFYID0gQmlnSW50KFwiOTIyMzM3MjAzNjg1NDc3NTgwN1wiKTtcbiAgICAgICAgY29uc3QgVU1JTiA9IEJpZ0ludChcIjBcIik7XG4gICAgICAgIGNvbnN0IFVNQVggPSBCaWdJbnQoXCIxODQ0Njc0NDA3MzcwOTU1MTYxNVwiKTtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHplcm86IEJpZ0ludCgwKSxcbiAgICAgICAgICAgIHN1cHBvcnRlZDogdHJ1ZSxcbiAgICAgICAgICAgIHBhcnNlKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYmkgPSB0eXBlb2YgdmFsdWUgPT0gXCJiaWdpbnRcIiA/IHZhbHVlIDogQmlnSW50KHZhbHVlKTtcbiAgICAgICAgICAgICAgICBpZiAoYmkgPiBNQVggfHwgYmkgPCBNSU4pIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBpbnZhbGlkIGludDY0OiAke3ZhbHVlfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gYmk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdVBhcnNlKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYmkgPSB0eXBlb2YgdmFsdWUgPT0gXCJiaWdpbnRcIiA/IHZhbHVlIDogQmlnSW50KHZhbHVlKTtcbiAgICAgICAgICAgICAgICBpZiAoYmkgPiBVTUFYIHx8IGJpIDwgVU1JTikge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGludmFsaWQgdWludDY0OiAke3ZhbHVlfWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gYmk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZW5jKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgZHYuc2V0QmlnSW50NjQoMCwgdGhpcy5wYXJzZSh2YWx1ZSksIHRydWUpO1xuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIGxvOiBkdi5nZXRJbnQzMigwLCB0cnVlKSxcbiAgICAgICAgICAgICAgICAgICAgaGk6IGR2LmdldEludDMyKDQsIHRydWUpLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdUVuYyh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIGR2LnNldEJpZ0ludDY0KDAsIHRoaXMudVBhcnNlKHZhbHVlKSwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgbG86IGR2LmdldEludDMyKDAsIHRydWUpLFxuICAgICAgICAgICAgICAgICAgICBoaTogZHYuZ2V0SW50MzIoNCwgdHJ1ZSksXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBkZWMobG8sIGhpKSB7XG4gICAgICAgICAgICAgICAgZHYuc2V0SW50MzIoMCwgbG8sIHRydWUpO1xuICAgICAgICAgICAgICAgIGR2LnNldEludDMyKDQsIGhpLCB0cnVlKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gZHYuZ2V0QmlnSW50NjQoMCwgdHJ1ZSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdURlYyhsbywgaGkpIHtcbiAgICAgICAgICAgICAgICBkdi5zZXRJbnQzMigwLCBsbywgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgZHYuc2V0SW50MzIoNCwgaGksIHRydWUpO1xuICAgICAgICAgICAgICAgIHJldHVybiBkdi5nZXRCaWdVaW50NjQoMCwgdHJ1ZSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgICB6ZXJvOiBcIjBcIixcbiAgICAgICAgc3VwcG9ydGVkOiBmYWxzZSxcbiAgICAgICAgcGFyc2UodmFsdWUpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgIT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIHZhbHVlID0gdmFsdWUudG9TdHJpbmcoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGFzc2VydEludDY0U3RyaW5nKHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfSxcbiAgICAgICAgdVBhcnNlKHZhbHVlKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlICE9IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHZhbHVlLnRvU3RyaW5nKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhc3NlcnRVSW50NjRTdHJpbmcodmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICB9LFxuICAgICAgICBlbmModmFsdWUpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgIT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIHZhbHVlID0gdmFsdWUudG9TdHJpbmcoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGFzc2VydEludDY0U3RyaW5nKHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBpbnQ2NEZyb21TdHJpbmcodmFsdWUpO1xuICAgICAgICB9LFxuICAgICAgICB1RW5jKHZhbHVlKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlICE9IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHZhbHVlLnRvU3RyaW5nKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhc3NlcnRVSW50NjRTdHJpbmcodmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIGludDY0RnJvbVN0cmluZyh2YWx1ZSk7XG4gICAgICAgIH0sXG4gICAgICAgIGRlYyhsbywgaGkpIHtcbiAgICAgICAgICAgIHJldHVybiBpbnQ2NFRvU3RyaW5nKGxvLCBoaSk7XG4gICAgICAgIH0sXG4gICAgICAgIHVEZWMobG8sIGhpKSB7XG4gICAgICAgICAgICByZXR1cm4gdUludDY0VG9TdHJpbmcobG8sIGhpKTtcbiAgICAgICAgfSxcbiAgICB9O1xufVxuZnVuY3Rpb24gYXNzZXJ0SW50NjRTdHJpbmcodmFsdWUpIHtcbiAgICBpZiAoIS9eLT9bMC05XSskLy50ZXN0KHZhbHVlKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbnZhbGlkIGludDY0OiBcIiArIHZhbHVlKTtcbiAgICB9XG59XG5mdW5jdGlvbiBhc3NlcnRVSW50NjRTdHJpbmcodmFsdWUpIHtcbiAgICBpZiAoIS9eWzAtOV0rJC8udGVzdCh2YWx1ZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiaW52YWxpZCB1aW50NjQ6IFwiICsgdmFsdWUpO1xuICAgIH1cbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuLyoqXG4gKiBTY2FsYXIgdmFsdWUgdHlwZXMuIFRoaXMgaXMgYSBzdWJzZXQgb2YgZmllbGQgdHlwZXMgZGVjbGFyZWQgYnkgcHJvdG9idWZcbiAqIGVudW0gZ29vZ2xlLnByb3RvYnVmLkZpZWxkRGVzY3JpcHRvclByb3RvLlR5cGUgVGhlIHR5cGVzIEdST1VQIGFuZCBNRVNTQUdFXG4gKiBhcmUgb21pdHRlZCwgYnV0IHRoZSBudW1lcmljYWwgdmFsdWVzIGFyZSBpZGVudGljYWwuXG4gKi9cbmV4cG9ydCB2YXIgU2NhbGFyVHlwZTtcbihmdW5jdGlvbiAoU2NhbGFyVHlwZSkge1xuICAgIC8vIDAgaXMgcmVzZXJ2ZWQgZm9yIGVycm9ycy5cbiAgICAvLyBPcmRlciBpcyB3ZWlyZCBmb3IgaGlzdG9yaWNhbCByZWFzb25zLlxuICAgIFNjYWxhclR5cGVbU2NhbGFyVHlwZVtcIkRPVUJMRVwiXSA9IDFdID0gXCJET1VCTEVcIjtcbiAgICBTY2FsYXJUeXBlW1NjYWxhclR5cGVbXCJGTE9BVFwiXSA9IDJdID0gXCJGTE9BVFwiO1xuICAgIC8vIE5vdCBaaWdaYWcgZW5jb2RlZC4gIE5lZ2F0aXZlIG51bWJlcnMgdGFrZSAxMCBieXRlcy4gIFVzZSBUWVBFX1NJTlQ2NCBpZlxuICAgIC8vIG5lZ2F0aXZlIHZhbHVlcyBhcmUgbGlrZWx5LlxuICAgIFNjYWxhclR5cGVbU2NhbGFyVHlwZVtcIklOVDY0XCJdID0gM10gPSBcIklOVDY0XCI7XG4gICAgU2NhbGFyVHlwZVtTY2FsYXJUeXBlW1wiVUlOVDY0XCJdID0gNF0gPSBcIlVJTlQ2NFwiO1xuICAgIC8vIE5vdCBaaWdaYWcgZW5jb2RlZC4gIE5lZ2F0aXZlIG51bWJlcnMgdGFrZSAxMCBieXRlcy4gIFVzZSBUWVBFX1NJTlQzMiBpZlxuICAgIC8vIG5lZ2F0aXZlIHZhbHVlcyBhcmUgbGlrZWx5LlxuICAgIFNjYWxhclR5cGVbU2NhbGFyVHlwZVtcIklOVDMyXCJdID0gNV0gPSBcIklOVDMyXCI7XG4gICAgU2NhbGFyVHlwZVtTY2FsYXJUeXBlW1wiRklYRUQ2NFwiXSA9IDZdID0gXCJGSVhFRDY0XCI7XG4gICAgU2NhbGFyVHlwZVtTY2FsYXJUeXBlW1wiRklYRUQzMlwiXSA9IDddID0gXCJGSVhFRDMyXCI7XG4gICAgU2NhbGFyVHlwZVtTY2FsYXJUeXBlW1wiQk9PTFwiXSA9IDhdID0gXCJCT09MXCI7XG4gICAgU2NhbGFyVHlwZVtTY2FsYXJUeXBlW1wiU1RSSU5HXCJdID0gOV0gPSBcIlNUUklOR1wiO1xuICAgIC8vIFRhZy1kZWxpbWl0ZWQgYWdncmVnYXRlLlxuICAgIC8vIEdyb3VwIHR5cGUgaXMgZGVwcmVjYXRlZCBhbmQgbm90IHN1cHBvcnRlZCBpbiBwcm90bzMuIEhvd2V2ZXIsIFByb3RvM1xuICAgIC8vIGltcGxlbWVudGF0aW9ucyBzaG91bGQgc3RpbGwgYmUgYWJsZSB0byBwYXJzZSB0aGUgZ3JvdXAgd2lyZSBmb3JtYXQgYW5kXG4gICAgLy8gdHJlYXQgZ3JvdXAgZmllbGRzIGFzIHVua25vd24gZmllbGRzLlxuICAgIC8vIFRZUEVfR1JPVVAgPSAxMCxcbiAgICAvLyBUWVBFX01FU1NBR0UgPSAxMSwgIC8vIExlbmd0aC1kZWxpbWl0ZWQgYWdncmVnYXRlLlxuICAgIC8vIE5ldyBpbiB2ZXJzaW9uIDIuXG4gICAgU2NhbGFyVHlwZVtTY2FsYXJUeXBlW1wiQllURVNcIl0gPSAxMl0gPSBcIkJZVEVTXCI7XG4gICAgU2NhbGFyVHlwZVtTY2FsYXJUeXBlW1wiVUlOVDMyXCJdID0gMTNdID0gXCJVSU5UMzJcIjtcbiAgICAvLyBUWVBFX0VOVU0gPSAxNCxcbiAgICBTY2FsYXJUeXBlW1NjYWxhclR5cGVbXCJTRklYRUQzMlwiXSA9IDE1XSA9IFwiU0ZJWEVEMzJcIjtcbiAgICBTY2FsYXJUeXBlW1NjYWxhclR5cGVbXCJTRklYRUQ2NFwiXSA9IDE2XSA9IFwiU0ZJWEVENjRcIjtcbiAgICBTY2FsYXJUeXBlW1NjYWxhclR5cGVbXCJTSU5UMzJcIl0gPSAxN10gPSBcIlNJTlQzMlwiO1xuICAgIFNjYWxhclR5cGVbU2NhbGFyVHlwZVtcIlNJTlQ2NFwiXSA9IDE4XSA9IFwiU0lOVDY0XCI7XG59KShTY2FsYXJUeXBlIHx8IChTY2FsYXJUeXBlID0ge30pKTtcbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuaW1wb3J0IHsgcHJvdG9JbnQ2NCB9IGZyb20gXCIuLi9wcm90by1pbnQ2NC5qc1wiO1xuaW1wb3J0IHsgU2NhbGFyVHlwZSB9IGZyb20gXCIuLi9kZXNjcmlwdG9ycy5qc1wiO1xuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgYm90aCBzY2FsYXIgdmFsdWVzIGFyZSBlcXVhbC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNjYWxhckVxdWFscyh0eXBlLCBhLCBiKSB7XG4gICAgaWYgKGEgPT09IGIpIHtcbiAgICAgICAgLy8gVGhpcyBjb3JyZWN0bHkgbWF0Y2hlcyBlcXVhbCB2YWx1ZXMgZXhjZXB0IEJZVEVTIGFuZCAocG9zc2libHkpIDY0LWJpdCBpbnRlZ2Vycy5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIC8vIFNwZWNpYWwgY2FzZSBCWVRFUyAtIHdlIG5lZWQgdG8gY29tcGFyZSBlYWNoIGJ5dGUgaW5kaXZpZHVhbGx5XG4gICAgaWYgKHR5cGUgPT0gU2NhbGFyVHlwZS5CWVRFUykge1xuICAgICAgICBpZiAoIShhIGluc3RhbmNlb2YgVWludDhBcnJheSkgfHwgIShiIGluc3RhbmNlb2YgVWludDhBcnJheSkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoYS5sZW5ndGggIT09IGIubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoYVtpXSAhPT0gYltpXSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgLy8gU3BlY2lhbCBjYXNlIDY0LWJpdCBpbnRlZ2VycyAtIHdlIHN1cHBvcnQgbnVtYmVyLCBzdHJpbmcgYW5kIGJpZ2ludCByZXByZXNlbnRhdGlvbi5cbiAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlVJTlQ2NDpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZJWEVENjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5JTlQ2NDpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNGSVhFRDY0OlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0lOVDY0OlxuICAgICAgICAgICAgLy8gTG9vc2UgY29tcGFyaXNvbiB3aWxsIG1hdGNoIGJldHdlZW4gMG4sIDAgYW5kIFwiMFwiLlxuICAgICAgICAgICAgcmV0dXJuIGEgPT0gYjtcbiAgICB9XG4gICAgLy8gQW55dGhpbmcgdGhhdCBoYXNuJ3QgYmVlbiBjYXVnaHQgYnkgc3RyaWN0IGNvbXBhcmlzb24gb3Igc3BlY2lhbCBjYXNlZFxuICAgIC8vIEJZVEVTIGFuZCA2NC1iaXQgaW50ZWdlcnMgaXMgbm90IGVxdWFsLlxuICAgIHJldHVybiBmYWxzZTtcbn1cbi8qKlxuICogUmV0dXJucyB0aGUgemVybyB2YWx1ZSBmb3IgdGhlIGdpdmVuIHNjYWxhciB0eXBlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2NhbGFyWmVyb1ZhbHVlKHR5cGUsIGxvbmdBc1N0cmluZykge1xuICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU1RSSU5HOlxuICAgICAgICAgICAgcmV0dXJuIFwiXCI7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5CT09MOlxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRE9VQkxFOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRkxPQVQ6XG4gICAgICAgICAgICByZXR1cm4gMC4wO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuSU5UNjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5VSU5UNjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TRklYRUQ2NDpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZJWEVENjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TSU5UNjQ6XG4gICAgICAgICAgICByZXR1cm4gKGxvbmdBc1N0cmluZyA/IFwiMFwiIDogcHJvdG9JbnQ2NC56ZXJvKTtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkJZVEVTOlxuICAgICAgICAgICAgcmV0dXJuIG5ldyBVaW50OEFycmF5KDApO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgLy8gSGFuZGxlcyBJTlQzMiwgVUlOVDMyLCBTSU5UMzIsIEZJWEVEMzIsIFNGSVhFRDMyLlxuICAgICAgICAgICAgLy8gV2UgZG8gbm90IHVzZSBpbmRpdmlkdWFsIGNhc2VzIHRvIHNhdmUgYSBmZXcgYnl0ZXMgY29kZSBzaXplLlxuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxufVxuLyoqXG4gKiBSZXR1cm5zIHRydWUgZm9yIGEgemVyby12YWx1ZS4gRm9yIGV4YW1wbGUsIGFuIGludGVnZXIgaGFzIHRoZSB6ZXJvLXZhbHVlIGAwYCxcbiAqIGEgYm9vbGVhbiBpcyBgZmFsc2VgLCBhIHN0cmluZyBpcyBgXCJcImAsIGFuZCBieXRlcyBpcyBhbiBlbXB0eSBVaW50OEFycmF5LlxuICpcbiAqIEluIHByb3RvMywgemVyby12YWx1ZXMgYXJlIG5vdCB3cml0dGVuIHRvIHRoZSB3aXJlLCB1bmxlc3MgdGhlIGZpZWxkIGlzXG4gKiBvcHRpb25hbCBvciByZXBlYXRlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzU2NhbGFyWmVyb1ZhbHVlKHR5cGUsIHZhbHVlKSB7XG4gICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5CT09MOlxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlID09PSBmYWxzZTtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNUUklORzpcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZSA9PT0gXCJcIjtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkJZVEVTOlxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlIGluc3RhbmNlb2YgVWludDhBcnJheSAmJiAhdmFsdWUuYnl0ZUxlbmd0aDtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZSA9PSAwOyAvLyBMb29zZSBjb21wYXJpc29uIG1hdGNoZXMgMG4sIDAgYW5kIFwiMFwiXG4gICAgfVxufVxuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5pbXBvcnQgeyBpc1NjYWxhclplcm9WYWx1ZSwgc2NhbGFyWmVyb1ZhbHVlIH0gZnJvbSBcIi4vc2NhbGFyLmpzXCI7XG4vLyBib290c3RyYXAtaW5qZWN0IGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LkZpZWxkUHJlc2VuY2UuSU1QTElDSVQ6IGNvbnN0ICRuYW1lOiBGZWF0dXJlU2V0X0ZpZWxkUHJlc2VuY2UuJGxvY2FsTmFtZSA9ICRudW1iZXI7XG5jb25zdCBJTVBMSUNJVCA9IDI7XG5leHBvcnQgY29uc3QgdW5zYWZlTG9jYWwgPSBTeW1ib2wuZm9yKFwicmVmbGVjdCB1bnNhZmUgbG9jYWxcIik7XG4vKipcbiAqIFJldHVybiB0aGUgc2VsZWN0ZWQgZmllbGQgb2YgYSBvbmVvZiBncm91cC5cbiAqXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gdW5zYWZlT25lb2ZDYXNlKFxuLy8gYmlvbWUtaWdub3JlIGxpbnQvc3VzcGljaW91cy9ub0V4cGxpY2l0QW55OiBgYW55YCBpcyB0aGUgYmVzdCBjaG9pY2UgZm9yIGR5bmFtaWMgYWNjZXNzXG50YXJnZXQsIG9uZW9mKSB7XG4gICAgY29uc3QgYyA9IHRhcmdldFtvbmVvZi5sb2NhbE5hbWVdLmNhc2U7XG4gICAgaWYgKGMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gYztcbiAgICB9XG4gICAgcmV0dXJuIG9uZW9mLmZpZWxkcy5maW5kKChmKSA9PiBmLmxvY2FsTmFtZSA9PT0gYyk7XG59XG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgZmllbGQgaXMgc2V0LlxuICpcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1bnNhZmVJc1NldChcbi8vIGJpb21lLWlnbm9yZSBsaW50L3N1c3BpY2lvdXMvbm9FeHBsaWNpdEFueTogYGFueWAgaXMgdGhlIGJlc3QgY2hvaWNlIGZvciBkeW5hbWljIGFjY2Vzc1xudGFyZ2V0LCBmaWVsZCkge1xuICAgIGNvbnN0IG5hbWUgPSBmaWVsZC5sb2NhbE5hbWU7XG4gICAgaWYgKGZpZWxkLm9uZW9mKSB7XG4gICAgICAgIHJldHVybiB0YXJnZXRbZmllbGQub25lb2YubG9jYWxOYW1lXS5jYXNlID09PSBuYW1lO1xuICAgIH1cbiAgICBpZiAoZmllbGQucHJlc2VuY2UgIT0gSU1QTElDSVQpIHtcbiAgICAgICAgLy8gRmllbGRzIHdpdGggZXhwbGljaXQgcHJlc2VuY2UgaGF2ZSBwcm9wZXJ0aWVzIG9uIHRoZSBwcm90b3R5cGUgY2hhaW5cbiAgICAgICAgLy8gZm9yIGRlZmF1bHQgLyB6ZXJvIHZhbHVlcyAoZXhjZXB0IGZvciBwcm90bzMpLlxuICAgICAgICByZXR1cm4gKHRhcmdldFtuYW1lXSAhPT0gdW5kZWZpbmVkICYmXG4gICAgICAgICAgICBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGFyZ2V0LCBuYW1lKSk7XG4gICAgfVxuICAgIHN3aXRjaCAoZmllbGQuZmllbGRLaW5kKSB7XG4gICAgICAgIGNhc2UgXCJsaXN0XCI6XG4gICAgICAgICAgICByZXR1cm4gdGFyZ2V0W25hbWVdLmxlbmd0aCA+IDA7XG4gICAgICAgIGNhc2UgXCJtYXBcIjpcbiAgICAgICAgICAgIHJldHVybiBPYmplY3Qua2V5cyh0YXJnZXRbbmFtZV0pLmxlbmd0aCA+IDA7XG4gICAgICAgIGNhc2UgXCJzY2FsYXJcIjpcbiAgICAgICAgICAgIHJldHVybiAhaXNTY2FsYXJaZXJvVmFsdWUoZmllbGQuc2NhbGFyLCB0YXJnZXRbbmFtZV0pO1xuICAgICAgICBjYXNlIFwiZW51bVwiOlxuICAgICAgICAgICAgcmV0dXJuIHRhcmdldFtuYW1lXSAhPT0gZmllbGQuZW51bS52YWx1ZXNbMF0ubnVtYmVyO1xuICAgIH1cbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJtZXNzYWdlIGZpZWxkIHdpdGggaW1wbGljaXQgcHJlc2VuY2VcIik7XG59XG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgZmllbGQgaXMgc2V0LCBidXQgb25seSBmb3Igc2luZ3VsYXIgZmllbGRzIHdpdGggZXhwbGljaXRcbiAqIHByZXNlbmNlIChwcm90bzIpLlxuICpcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1bnNhZmVJc1NldEV4cGxpY2l0KHRhcmdldCwgbG9jYWxOYW1lKSB7XG4gICAgcmV0dXJuIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGFyZ2V0LCBsb2NhbE5hbWUpICYmXG4gICAgICAgIHRhcmdldFtsb2NhbE5hbWVdICE9PSB1bmRlZmluZWQpO1xufVxuLyoqXG4gKiBSZXR1cm4gYSBmaWVsZCB2YWx1ZSwgcmVzcGVjdGluZyBvbmVvZiBncm91cHMuXG4gKlxuICogQHByaXZhdGVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHVuc2FmZUdldCh0YXJnZXQsIGZpZWxkKSB7XG4gICAgaWYgKGZpZWxkLm9uZW9mKSB7XG4gICAgICAgIGNvbnN0IG9uZW9mID0gdGFyZ2V0W2ZpZWxkLm9uZW9mLmxvY2FsTmFtZV07XG4gICAgICAgIGlmIChvbmVvZi5jYXNlID09PSBmaWVsZC5sb2NhbE5hbWUpIHtcbiAgICAgICAgICAgIHJldHVybiBvbmVvZi52YWx1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICByZXR1cm4gdGFyZ2V0W2ZpZWxkLmxvY2FsTmFtZV07XG59XG4vKipcbiAqIFNldCBhIGZpZWxkIHZhbHVlLCByZXNwZWN0aW5nIG9uZW9mIGdyb3Vwcy5cbiAqXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gdW5zYWZlU2V0KHRhcmdldCwgZmllbGQsIHZhbHVlKSB7XG4gICAgaWYgKGZpZWxkLm9uZW9mKSB7XG4gICAgICAgIHRhcmdldFtmaWVsZC5vbmVvZi5sb2NhbE5hbWVdID0ge1xuICAgICAgICAgICAgY2FzZTogZmllbGQubG9jYWxOYW1lLFxuICAgICAgICAgICAgdmFsdWU6IHZhbHVlLFxuICAgICAgICB9O1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgdGFyZ2V0W2ZpZWxkLmxvY2FsTmFtZV0gPSB2YWx1ZTtcbiAgICB9XG59XG4vKipcbiAqIFJlc2V0cyB0aGUgZmllbGQsIHNvIHRoYXQgdW5zYWZlSXNTZXQoKSB3aWxsIHJldHVybiBmYWxzZS5cbiAqXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gdW5zYWZlQ2xlYXIoXG4vLyBiaW9tZS1pZ25vcmUgbGludC9zdXNwaWNpb3VzL25vRXhwbGljaXRBbnk6IGBhbnlgIGlzIHRoZSBiZXN0IGNob2ljZSBmb3IgZHluYW1pYyBhY2Nlc3NcbnRhcmdldCwgZmllbGQpIHtcbiAgICBjb25zdCBuYW1lID0gZmllbGQubG9jYWxOYW1lO1xuICAgIGlmIChmaWVsZC5vbmVvZikge1xuICAgICAgICBjb25zdCBvbmVvZkxvY2FsTmFtZSA9IGZpZWxkLm9uZW9mLmxvY2FsTmFtZTtcbiAgICAgICAgaWYgKHRhcmdldFtvbmVvZkxvY2FsTmFtZV0uY2FzZSA9PT0gbmFtZSkge1xuICAgICAgICAgICAgdGFyZ2V0W29uZW9mTG9jYWxOYW1lXSA9IHsgY2FzZTogdW5kZWZpbmVkIH07XG4gICAgICAgIH1cbiAgICB9XG4gICAgZWxzZSBpZiAoZmllbGQucHJlc2VuY2UgIT0gSU1QTElDSVQpIHtcbiAgICAgICAgLy8gRmllbGRzIHdpdGggZXhwbGljaXQgcHJlc2VuY2UgaGF2ZSBwcm9wZXJ0aWVzIG9uIHRoZSBwcm90b3R5cGUgY2hhaW5cbiAgICAgICAgLy8gZm9yIGRlZmF1bHQgLyB6ZXJvIHZhbHVlcyAoZXhjZXB0IGZvciBwcm90bzMpLiBCeSBkZWxldGluZyB0aGVpciBvd25cbiAgICAgICAgLy8gcHJvcGVydHksIHRoZSBmaWVsZCBpcyByZXNldC5cbiAgICAgICAgZGVsZXRlIHRhcmdldFtuYW1lXTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHN3aXRjaCAoZmllbGQuZmllbGRLaW5kKSB7XG4gICAgICAgICAgICBjYXNlIFwibWFwXCI6XG4gICAgICAgICAgICAgICAgdGFyZ2V0W25hbWVdID0ge307XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwibGlzdFwiOlxuICAgICAgICAgICAgICAgIHRhcmdldFtuYW1lXSA9IFtdO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcImVudW1cIjpcbiAgICAgICAgICAgICAgICB0YXJnZXRbbmFtZV0gPSBmaWVsZC5lbnVtLnZhbHVlc1swXS5udW1iZXI7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwic2NhbGFyXCI6XG4gICAgICAgICAgICAgICAgdGFyZ2V0W25hbWVdID0gc2NhbGFyWmVyb1ZhbHVlKGZpZWxkLnNjYWxhciwgZmllbGQubG9uZ0FzU3RyaW5nKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuaW1wb3J0IHsgcHJvdG9DYW1lbENhc2UgfSBmcm9tIFwiLi4vcmVmbGVjdC9uYW1lcy5qc1wiO1xuaW1wb3J0IHsgdW5zYWZlSXNTZXRFeHBsaWNpdCB9IGZyb20gXCIuLi9yZWZsZWN0L3Vuc2FmZS5qc1wiO1xuLyoqXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzdG9yZUpzb25OYW1lcyhtZXNzYWdlKSB7XG4gICAgZm9yIChjb25zdCBmIG9mIG1lc3NhZ2UuZmllbGQpIHtcbiAgICAgICAgaWYgKCF1bnNhZmVJc1NldEV4cGxpY2l0KGYsIFwianNvbk5hbWVcIikpIHtcbiAgICAgICAgICAgIGYuanNvbk5hbWUgPSBwcm90b0NhbWVsQ2FzZShmLm5hbWUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIG1lc3NhZ2UubmVzdGVkVHlwZS5mb3JFYWNoKHJlc3RvcmVKc29uTmFtZXMpO1xufVxuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5pbXBvcnQgeyBTY2FsYXJUeXBlIH0gZnJvbSBcIi4uL2Rlc2NyaXB0b3JzLmpzXCI7XG5pbXBvcnQgeyBwcm90b0ludDY0IH0gZnJvbSBcIi4uL3Byb3RvLWludDY0LmpzXCI7XG4vKipcbiAqIFBhcnNlIGFuIGVudW0gdmFsdWUgZnJvbSB0aGUgUHJvdG9idWYgdGV4dCBmb3JtYXQuXG4gKlxuICogQHByaXZhdGVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlVGV4dEZvcm1hdEVudW1WYWx1ZShkZXNjRW51bSwgdmFsdWUpIHtcbiAgICBjb25zdCBlbnVtVmFsdWUgPSBkZXNjRW51bS52YWx1ZXMuZmluZCgodikgPT4gdi5uYW1lID09PSB2YWx1ZSk7XG4gICAgaWYgKCFlbnVtVmFsdWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgcGFyc2UgJHtkZXNjRW51bX0gZGVmYXVsdCB2YWx1ZTogJHt2YWx1ZX1gKTtcbiAgICB9XG4gICAgcmV0dXJuIGVudW1WYWx1ZS5udW1iZXI7XG59XG4vKipcbiAqIFBhcnNlIGEgc2NhbGFyIHZhbHVlIGZyb20gdGhlIFByb3RvYnVmIHRleHQgZm9ybWF0LlxuICpcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVRleHRGb3JtYXRTY2FsYXJWYWx1ZSh0eXBlLCB2YWx1ZSkge1xuICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU1RSSU5HOlxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuQllURVM6IHtcbiAgICAgICAgICAgIGNvbnN0IHUgPSB1bmVzY2FwZUJ5dGVzRGVmYXVsdFZhbHVlKHZhbHVlKTtcbiAgICAgICAgICAgIGlmICh1ID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IHBhcnNlICR7U2NhbGFyVHlwZVt0eXBlXX0gZGVmYXVsdCB2YWx1ZTogJHt2YWx1ZX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB1O1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5JTlQ2NDpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNGSVhFRDY0OlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0lOVDY0OlxuICAgICAgICAgICAgcmV0dXJuIHByb3RvSW50NjQucGFyc2UodmFsdWUpO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuVUlOVDY0OlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRklYRUQ2NDpcbiAgICAgICAgICAgIHJldHVybiBwcm90b0ludDY0LnVQYXJzZSh2YWx1ZSk7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5ET1VCTEU6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5GTE9BVDpcbiAgICAgICAgICAgIHN3aXRjaCAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICBjYXNlIFwiaW5mXCI6XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG4gICAgICAgICAgICAgICAgY2FzZSBcIi1pbmZcIjpcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcbiAgICAgICAgICAgICAgICBjYXNlIFwibmFuXCI6XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBOdW1iZXIuTmFOO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBwYXJzZUZsb2F0KHZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkJPT0w6XG4gICAgICAgICAgICByZXR1cm4gdmFsdWUgPT09IFwidHJ1ZVwiO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuSU5UMzI6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5VSU5UMzI6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TSU5UMzI6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5GSVhFRDMyOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0ZJWEVEMzI6XG4gICAgICAgICAgICByZXR1cm4gcGFyc2VJbnQodmFsdWUsIDEwKTtcbiAgICB9XG59XG4vKipcbiAqIFBhcnNlcyBhIHRleHQtZW5jb2RlZCBkZWZhdWx0IHZhbHVlIChwcm90bzIpIG9mIGEgQllURVMgZmllbGQuXG4gKi9cbmZ1bmN0aW9uIHVuZXNjYXBlQnl0ZXNEZWZhdWx0VmFsdWUoc3RyKSB7XG4gICAgY29uc3QgYiA9IFtdO1xuICAgIGNvbnN0IGlucHV0ID0ge1xuICAgICAgICB0YWlsOiBzdHIsXG4gICAgICAgIGM6IFwiXCIsXG4gICAgICAgIG5leHQoKSB7XG4gICAgICAgICAgICBpZiAodGhpcy50YWlsLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jID0gdGhpcy50YWlsWzBdO1xuICAgICAgICAgICAgdGhpcy50YWlsID0gdGhpcy50YWlsLnN1YnN0cmluZygxKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9LFxuICAgICAgICB0YWtlKG4pIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnRhaWwubGVuZ3RoID49IG4pIHtcbiAgICAgICAgICAgICAgICBjb25zdCByID0gdGhpcy50YWlsLnN1YnN0cmluZygwLCBuKTtcbiAgICAgICAgICAgICAgICB0aGlzLnRhaWwgPSB0aGlzLnRhaWwuc3Vic3RyaW5nKG4pO1xuICAgICAgICAgICAgICAgIHJldHVybiByO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9LFxuICAgIH07XG4gICAgd2hpbGUgKGlucHV0Lm5leHQoKSkge1xuICAgICAgICBzd2l0Y2ggKGlucHV0LmMpIHtcbiAgICAgICAgICAgIGNhc2UgXCJcXFxcXCI6XG4gICAgICAgICAgICAgICAgaWYgKGlucHV0Lm5leHQoKSkge1xuICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKGlucHV0LmMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJcXFxcXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYi5wdXNoKGlucHV0LmMuY2hhckNvZGVBdCgwKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiYlwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGIucHVzaCgweDA4KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJmXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYi5wdXNoKDB4MGMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcIm5cIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiLnB1c2goMHgwYSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiclwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGIucHVzaCgweDBkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJ0XCI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYi5wdXNoKDB4MDkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcInZcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiLnB1c2goMHgwYik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiMFwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcIjFcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCIyXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiM1wiOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcIjRcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCI1XCI6XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiNlwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcIjdcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBpbnB1dC5jO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHQgPSBpbnB1dC50YWtlKDIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0ID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG4gPSBwYXJzZUludChzICsgdCwgOCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKE51bWJlci5pc05hTihuKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGIucHVzaChuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJ4XCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBzID0gaW5wdXQuYztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0ID0gaW5wdXQudGFrZSgyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodCA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuID0gcGFyc2VJbnQocyArIHQsIDE2KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoTnVtYmVyLmlzTmFOKG4pKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYi5wdXNoKG4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBcInVcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHMgPSBpbnB1dC5jO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHQgPSBpbnB1dC50YWtlKDQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0ID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG4gPSBwYXJzZUludChzICsgdCwgMTYpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChOdW1iZXIuaXNOYU4obikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjaHVuayA9IG5ldyBVaW50OEFycmF5KDQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHZpZXcgPSBuZXcgRGF0YVZpZXcoY2h1bmsuYnVmZmVyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2aWV3LnNldEludDMyKDAsIG4sIHRydWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGIucHVzaChjaHVua1swXSwgY2h1bmtbMV0sIGNodW5rWzJdLCBjaHVua1szXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFwiVVwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcyA9IGlucHV0LmM7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdCA9IGlucHV0LnRha2UoOCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHQgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdGMgPSBwcm90b0ludDY0LnVFbmMocyArIHQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNodW5rID0gbmV3IFVpbnQ4QXJyYXkoOCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdmlldyA9IG5ldyBEYXRhVmlldyhjaHVuay5idWZmZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZpZXcuc2V0SW50MzIoMCwgdGMubG8sIHRydWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZpZXcuc2V0SW50MzIoNCwgdGMuaGksIHRydWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGIucHVzaChjaHVua1swXSwgY2h1bmtbMV0sIGNodW5rWzJdLCBjaHVua1szXSwgY2h1bmtbNF0sIGNodW5rWzVdLCBjaHVua1s2XSwgY2h1bmtbN10pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICBiLnB1c2goaW5wdXQuYy5jaGFyQ29kZUF0KDApKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbmV3IFVpbnQ4QXJyYXkoYik7XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbi8qKlxuICogSXRlcmF0ZSBvdmVyIGFsbCB0eXBlcyAtIGVudW1lcmF0aW9ucywgZXh0ZW5zaW9ucywgc2VydmljZXMsIG1lc3NhZ2VzIC1cbiAqIGFuZCBlbnVtZXJhdGlvbnMsIGV4dGVuc2lvbnMgYW5kIG1lc3NhZ2VzIG5lc3RlZCBpbiBtZXNzYWdlcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uKiBuZXN0ZWRUeXBlcyhkZXNjKSB7XG4gICAgc3dpdGNoIChkZXNjLmtpbmQpIHtcbiAgICAgICAgY2FzZSBcImZpbGVcIjpcbiAgICAgICAgICAgIGZvciAoY29uc3QgbWVzc2FnZSBvZiBkZXNjLm1lc3NhZ2VzKSB7XG4gICAgICAgICAgICAgICAgeWllbGQgbWVzc2FnZTtcbiAgICAgICAgICAgICAgICB5aWVsZCogbmVzdGVkVHlwZXMobWVzc2FnZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB5aWVsZCogZGVzYy5lbnVtcztcbiAgICAgICAgICAgIHlpZWxkKiBkZXNjLnNlcnZpY2VzO1xuICAgICAgICAgICAgeWllbGQqIGRlc2MuZXh0ZW5zaW9ucztcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwibWVzc2FnZVwiOlxuICAgICAgICAgICAgZm9yIChjb25zdCBtZXNzYWdlIG9mIGRlc2MubmVzdGVkTWVzc2FnZXMpIHtcbiAgICAgICAgICAgICAgICB5aWVsZCBtZXNzYWdlO1xuICAgICAgICAgICAgICAgIHlpZWxkKiBuZXN0ZWRUeXBlcyhtZXNzYWdlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHlpZWxkKiBkZXNjLm5lc3RlZEVudW1zO1xuICAgICAgICAgICAgeWllbGQqIGRlc2MubmVzdGVkRXh0ZW5zaW9ucztcbiAgICAgICAgICAgIGJyZWFrO1xuICAgIH1cbn1cbi8qKlxuICogSXRlcmF0ZSBvdmVyIHR5cGVzIHJlZmVyZW5jZWQgYnkgZmllbGRzIG9mIHRoZSBnaXZlbiBtZXNzYWdlLlxuICpcbiAqIEZvciBleGFtcGxlOlxuICpcbiAqIGBgYHByb3RvXG4gKiBzeW50YXg9XCJwcm90bzNcIjtcbiAqXG4gKiBtZXNzYWdlIEV4YW1wbGUge1xuICogICBNc2cgc2luZ3VsYXIgPSAxO1xuICogICByZXBlYXRlZCBMZXZlbCBsaXN0ID0gMjtcbiAqIH1cbiAqXG4gKiBtZXNzYWdlIE1zZyB7fVxuICpcbiAqIGVudW0gTGV2ZWwge1xuICogICBMRVZFTF9VTlNQRUNJRklFRCA9IDA7XG4gKiB9XG4gKiBgYGBcbiAqXG4gKiBUaGUgbWVzc2FnZSBFeGFtcGxlIHJlZmVyZW5jZXMgdGhlIG1lc3NhZ2UgTXNnLCBhbmQgdGhlIGVudW0gTGV2ZWwuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1c2VkVHlwZXMoZGVzY01lc3NhZ2UpIHtcbiAgICByZXR1cm4gdXNlZFR5cGVzSW50ZXJuYWwoZGVzY01lc3NhZ2UsIG5ldyBTZXQoKSk7XG59XG5mdW5jdGlvbiogdXNlZFR5cGVzSW50ZXJuYWwoZGVzY01lc3NhZ2UsIHNlZW4pIHtcbiAgICB2YXIgX2EsIF9iO1xuICAgIGZvciAoY29uc3QgZmllbGQgb2YgZGVzY01lc3NhZ2UuZmllbGRzKSB7XG4gICAgICAgIGNvbnN0IHJlZiA9IChfYiA9IChfYSA9IGZpZWxkLmVudW0pICE9PSBudWxsICYmIF9hICE9PSB2b2lkIDAgPyBfYSA6IGZpZWxkLm1lc3NhZ2UpICE9PSBudWxsICYmIF9iICE9PSB2b2lkIDAgPyBfYiA6IHVuZGVmaW5lZDtcbiAgICAgICAgaWYgKCFyZWYgfHwgc2Vlbi5oYXMocmVmLnR5cGVOYW1lKSkge1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgc2Vlbi5hZGQocmVmLnR5cGVOYW1lKTtcbiAgICAgICAgeWllbGQgcmVmO1xuICAgICAgICBpZiAocmVmLmtpbmQgPT0gXCJtZXNzYWdlXCIpIHtcbiAgICAgICAgICAgIHlpZWxkKiB1c2VkVHlwZXNJbnRlcm5hbChyZWYsIHNlZW4pO1xuICAgICAgICB9XG4gICAgfVxufVxuLyoqXG4gKiBSZXR1cm5zIHRoZSBhbmNlc3RvcnMgb2YgYSBnaXZlbiBQcm90b2J1ZiBlbGVtZW50LCB1cCB0byB0aGUgZmlsZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcmVudFR5cGVzKGRlc2MpIHtcbiAgICBjb25zdCBwYXJlbnRzID0gW107XG4gICAgd2hpbGUgKGRlc2Mua2luZCAhPT0gXCJmaWxlXCIpIHtcbiAgICAgICAgY29uc3QgcCA9IHBhcmVudChkZXNjKTtcbiAgICAgICAgZGVzYyA9IHA7XG4gICAgICAgIHBhcmVudHMucHVzaChwKTtcbiAgICB9XG4gICAgcmV0dXJuIHBhcmVudHM7XG59XG5mdW5jdGlvbiBwYXJlbnQoZGVzYykge1xuICAgIHZhciBfYTtcbiAgICBzd2l0Y2ggKGRlc2Mua2luZCkge1xuICAgICAgICBjYXNlIFwiZW51bV92YWx1ZVwiOlxuICAgICAgICBjYXNlIFwiZmllbGRcIjpcbiAgICAgICAgY2FzZSBcIm9uZW9mXCI6XG4gICAgICAgIGNhc2UgXCJycGNcIjpcbiAgICAgICAgICAgIHJldHVybiBkZXNjLnBhcmVudDtcbiAgICAgICAgY2FzZSBcInNlcnZpY2VcIjpcbiAgICAgICAgICAgIHJldHVybiBkZXNjLmZpbGU7XG4gICAgICAgIGNhc2UgXCJleHRlbnNpb25cIjpcbiAgICAgICAgY2FzZSBcImVudW1cIjpcbiAgICAgICAgY2FzZSBcIm1lc3NhZ2VcIjpcbiAgICAgICAgICAgIHJldHVybiAoX2EgPSBkZXNjLnBhcmVudCkgIT09IG51bGwgJiYgX2EgIT09IHZvaWQgMCA/IF9hIDogZGVzYy5maWxlO1xuICAgIH1cbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuaW1wb3J0IHsgU2NhbGFyVHlwZSwgfSBmcm9tIFwiLi9kZXNjcmlwdG9ycy5qc1wiO1xuaW1wb3J0IHsgcGFyc2VUZXh0Rm9ybWF0RW51bVZhbHVlLCBwYXJzZVRleHRGb3JtYXRTY2FsYXJWYWx1ZSwgfSBmcm9tIFwiLi93aXJlL3RleHQtZm9ybWF0LmpzXCI7XG5pbXBvcnQgeyBuZXN0ZWRUeXBlcyB9IGZyb20gXCIuL3JlZmxlY3QvbmVzdGVkLXR5cGVzLmpzXCI7XG5pbXBvcnQgeyB1bnNhZmVJc1NldEV4cGxpY2l0IH0gZnJvbSBcIi4vcmVmbGVjdC91bnNhZmUuanNcIjtcbmltcG9ydCB7IHByb3RvQ2FtZWxDYXNlLCBzYWZlT2JqZWN0UHJvcGVydHkgfSBmcm9tIFwiLi9yZWZsZWN0L25hbWVzLmpzXCI7XG4vKipcbiAqIENyZWF0ZSBhIHJlZ2lzdHJ5IGZyb20gdGhlIGdpdmVuIGlucHV0cy5cbiAqXG4gKiBBbiBpbnB1dCBjYW4gYmU6XG4gKiAtIEFueSBtZXNzYWdlLCBlbnVtLCBzZXJ2aWNlLCBvciBleHRlbnNpb24gZGVzY3JpcHRvciwgd2hpY2ggYWRkcyBqdXN0IHRoZVxuICogICBkZXNjcmlwdG9yIGZvciB0aGlzIHR5cGUuXG4gKiAtIEEgZmlsZSBkZXNjcmlwdG9yLCB3aGljaCBhZGRzIGFsbCB0eXBlZCBkZWZpbmVkIGluIHRoaXMgZmlsZS5cbiAqIC0gQSByZWdpc3RyeSwgd2hpY2ggYWRkcyBhbGwgdHlwZXMgZnJvbSB0aGUgcmVnaXN0cnkuXG4gKlxuICogRm9yIGR1cGxpY2F0ZSBkZXNjcmlwdG9ycyAoc2FtZSB0eXBlIG5hbWUpLCB0aGUgb25lIGdpdmVuIGxhc3Qgd2lucy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVJlZ2lzdHJ5KC4uLmlucHV0KSB7XG4gICAgcmV0dXJuIGluaXRCYXNlUmVnaXN0cnkoaW5wdXQpO1xufVxuLyoqXG4gKiBDcmVhdGUgYSByZWdpc3RyeSB0aGF0IGFsbG93cyBhZGRpbmcgYW5kIHJlbW92aW5nIGRlc2NyaXB0b3JzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTXV0YWJsZVJlZ2lzdHJ5KC4uLmlucHV0KSB7XG4gICAgY29uc3QgcmVnID0gaW5pdEJhc2VSZWdpc3RyeShpbnB1dCk7XG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oT2JqZWN0LmFzc2lnbih7fSwgcmVnKSwgeyByZW1vdmUoZGVzYykge1xuICAgICAgICAgICAgdmFyIF9hO1xuICAgICAgICAgICAgaWYgKGRlc2Mua2luZCA9PSBcImV4dGVuc2lvblwiKSB7XG4gICAgICAgICAgICAgICAgKF9hID0gcmVnLmV4dGVuZGVlcy5nZXQoZGVzYy5leHRlbmRlZS50eXBlTmFtZSkpID09PSBudWxsIHx8IF9hID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfYS5kZWxldGUoZGVzYy5udW1iZXIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVnLnR5cGVzLmRlbGV0ZShkZXNjLnR5cGVOYW1lKTtcbiAgICAgICAgfSB9KTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVGaWxlUmVnaXN0cnkoLi4uYXJncykge1xuICAgIGNvbnN0IHJlZ2lzdHJ5ID0gY3JlYXRlQmFzZVJlZ2lzdHJ5KCk7XG4gICAgaWYgKCFhcmdzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gcmVnaXN0cnk7XG4gICAgfVxuICAgIGlmIChcIiR0eXBlTmFtZVwiIGluIGFyZ3NbMF0gJiZcbiAgICAgICAgYXJnc1swXS4kdHlwZU5hbWUgPT0gXCJnb29nbGUucHJvdG9idWYuRmlsZURlc2NyaXB0b3JTZXRcIikge1xuICAgICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgYXJnc1swXS5maWxlKSB7XG4gICAgICAgICAgICBhZGRGaWxlKGZpbGUsIHJlZ2lzdHJ5KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVnaXN0cnk7XG4gICAgfVxuICAgIGlmIChcIiR0eXBlTmFtZVwiIGluIGFyZ3NbMF0pIHtcbiAgICAgICAgY29uc3QgaW5wdXQgPSBhcmdzWzBdO1xuICAgICAgICBjb25zdCByZXNvbHZlID0gYXJnc1sxXTtcbiAgICAgICAgY29uc3Qgc2VlbiA9IG5ldyBTZXQoKTtcbiAgICAgICAgZnVuY3Rpb24gcmVjdXJzZURlcHMoZmlsZSkge1xuICAgICAgICAgICAgY29uc3QgZGVwcyA9IFtdO1xuICAgICAgICAgICAgZm9yIChjb25zdCBwcm90b0ZpbGVOYW1lIG9mIGZpbGUuZGVwZW5kZW5jeSkge1xuICAgICAgICAgICAgICAgIGlmIChyZWdpc3RyeS5nZXRGaWxlKHByb3RvRmlsZU5hbWUpICE9IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHNlZW4uaGFzKHByb3RvRmlsZU5hbWUpKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBkZXAgPSByZXNvbHZlKHByb3RvRmlsZU5hbWUpO1xuICAgICAgICAgICAgICAgIGlmICghZGVwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgVW5hYmxlIHRvIHJlc29sdmUgJHtwcm90b0ZpbGVOYW1lfSwgaW1wb3J0ZWQgYnkgJHtmaWxlLm5hbWV9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChcImtpbmRcIiBpbiBkZXApIHtcbiAgICAgICAgICAgICAgICAgICAgcmVnaXN0cnkuYWRkRmlsZShkZXAsIGZhbHNlLCB0cnVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHNlZW4uYWRkKGRlcC5uYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgZGVwcy5wdXNoKGRlcCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGRlcHMuY29uY2F0KC4uLmRlcHMubWFwKHJlY3Vyc2VEZXBzKSk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBmaWxlIG9mIFtpbnB1dCwgLi4ucmVjdXJzZURlcHMoaW5wdXQpXS5yZXZlcnNlKCkpIHtcbiAgICAgICAgICAgIGFkZEZpbGUoZmlsZSwgcmVnaXN0cnkpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBmb3IgKGNvbnN0IGZpbGVSZWcgb2YgYXJncykge1xuICAgICAgICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVSZWcuZmlsZXMpIHtcbiAgICAgICAgICAgICAgICByZWdpc3RyeS5hZGRGaWxlKGZpbGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZWdpc3RyeTtcbn1cbi8qKlxuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gY3JlYXRlQmFzZVJlZ2lzdHJ5KCkge1xuICAgIGNvbnN0IHR5cGVzID0gbmV3IE1hcCgpO1xuICAgIGNvbnN0IGV4dGVuZGVlcyA9IG5ldyBNYXAoKTtcbiAgICBjb25zdCBmaWxlcyA9IG5ldyBNYXAoKTtcbiAgICByZXR1cm4ge1xuICAgICAgICBraW5kOiBcInJlZ2lzdHJ5XCIsXG4gICAgICAgIHR5cGVzLFxuICAgICAgICBleHRlbmRlZXMsXG4gICAgICAgIFtTeW1ib2wuaXRlcmF0b3JdKCkge1xuICAgICAgICAgICAgcmV0dXJuIHR5cGVzLnZhbHVlcygpO1xuICAgICAgICB9LFxuICAgICAgICBnZXQgZmlsZXMoKSB7XG4gICAgICAgICAgICByZXR1cm4gZmlsZXMudmFsdWVzKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGFkZEZpbGUoZmlsZSwgc2tpcFR5cGVzLCB3aXRoRGVwcykge1xuICAgICAgICAgICAgZmlsZXMuc2V0KGZpbGUucHJvdG8ubmFtZSwgZmlsZSk7XG4gICAgICAgICAgICBpZiAoIXNraXBUeXBlcykge1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgdHlwZSBvZiBuZXN0ZWRUeXBlcyhmaWxlKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmFkZCh0eXBlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAod2l0aERlcHMpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGYgb2YgZmlsZS5kZXBlbmRlbmNpZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hZGRGaWxlKGYsIHNraXBUeXBlcywgd2l0aERlcHMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgYWRkKGRlc2MpIHtcbiAgICAgICAgICAgIGlmIChkZXNjLmtpbmQgPT0gXCJleHRlbnNpb25cIikge1xuICAgICAgICAgICAgICAgIGxldCBudW1iZXJUb0V4dCA9IGV4dGVuZGVlcy5nZXQoZGVzYy5leHRlbmRlZS50eXBlTmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKCFudW1iZXJUb0V4dCkge1xuICAgICAgICAgICAgICAgICAgICBleHRlbmRlZXMuc2V0KGRlc2MuZXh0ZW5kZWUudHlwZU5hbWUsIFxuICAgICAgICAgICAgICAgICAgICAvLyBiaW9tZS1pZ25vcmUgbGludC9zdXNwaWNpb3VzL25vQXNzaWduSW5FeHByZXNzaW9uczogbm9cbiAgICAgICAgICAgICAgICAgICAgKG51bWJlclRvRXh0ID0gbmV3IE1hcCgpKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG51bWJlclRvRXh0LnNldChkZXNjLm51bWJlciwgZGVzYyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0eXBlcy5zZXQoZGVzYy50eXBlTmFtZSwgZGVzYyk7XG4gICAgICAgIH0sXG4gICAgICAgIGdldCh0eXBlTmFtZSkge1xuICAgICAgICAgICAgcmV0dXJuIHR5cGVzLmdldCh0eXBlTmFtZSk7XG4gICAgICAgIH0sXG4gICAgICAgIGdldEZpbGUoZmlsZU5hbWUpIHtcbiAgICAgICAgICAgIHJldHVybiBmaWxlcy5nZXQoZmlsZU5hbWUpO1xuICAgICAgICB9LFxuICAgICAgICBnZXRNZXNzYWdlKHR5cGVOYW1lKSB7XG4gICAgICAgICAgICBjb25zdCB0ID0gdHlwZXMuZ2V0KHR5cGVOYW1lKTtcbiAgICAgICAgICAgIHJldHVybiAodCA9PT0gbnVsbCB8fCB0ID09PSB2b2lkIDAgPyB2b2lkIDAgOiB0LmtpbmQpID09IFwibWVzc2FnZVwiID8gdCA6IHVuZGVmaW5lZDtcbiAgICAgICAgfSxcbiAgICAgICAgZ2V0RW51bSh0eXBlTmFtZSkge1xuICAgICAgICAgICAgY29uc3QgdCA9IHR5cGVzLmdldCh0eXBlTmFtZSk7XG4gICAgICAgICAgICByZXR1cm4gKHQgPT09IG51bGwgfHwgdCA9PT0gdm9pZCAwID8gdm9pZCAwIDogdC5raW5kKSA9PSBcImVudW1cIiA/IHQgOiB1bmRlZmluZWQ7XG4gICAgICAgIH0sXG4gICAgICAgIGdldEV4dGVuc2lvbih0eXBlTmFtZSkge1xuICAgICAgICAgICAgY29uc3QgdCA9IHR5cGVzLmdldCh0eXBlTmFtZSk7XG4gICAgICAgICAgICByZXR1cm4gKHQgPT09IG51bGwgfHwgdCA9PT0gdm9pZCAwID8gdm9pZCAwIDogdC5raW5kKSA9PSBcImV4dGVuc2lvblwiID8gdCA6IHVuZGVmaW5lZDtcbiAgICAgICAgfSxcbiAgICAgICAgZ2V0RXh0ZW5zaW9uRm9yKGV4dGVuZGVlLCBubykge1xuICAgICAgICAgICAgdmFyIF9hO1xuICAgICAgICAgICAgcmV0dXJuIChfYSA9IGV4dGVuZGVlcy5nZXQoZXh0ZW5kZWUudHlwZU5hbWUpKSA9PT0gbnVsbCB8fCBfYSA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2EuZ2V0KG5vKTtcbiAgICAgICAgfSxcbiAgICAgICAgZ2V0U2VydmljZSh0eXBlTmFtZSkge1xuICAgICAgICAgICAgY29uc3QgdCA9IHR5cGVzLmdldCh0eXBlTmFtZSk7XG4gICAgICAgICAgICByZXR1cm4gKHQgPT09IG51bGwgfHwgdCA9PT0gdm9pZCAwID8gdm9pZCAwIDogdC5raW5kKSA9PSBcInNlcnZpY2VcIiA/IHQgOiB1bmRlZmluZWQ7XG4gICAgICAgIH0sXG4gICAgfTtcbn1cbi8qKlxuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gaW5pdEJhc2VSZWdpc3RyeShpbnB1dHMpIHtcbiAgICBjb25zdCByZWdpc3RyeSA9IGNyZWF0ZUJhc2VSZWdpc3RyeSgpO1xuICAgIGZvciAoY29uc3QgaW5wdXQgb2YgaW5wdXRzKSB7XG4gICAgICAgIHN3aXRjaCAoaW5wdXQua2luZCkge1xuICAgICAgICAgICAgY2FzZSBcInJlZ2lzdHJ5XCI6XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBuIG9mIGlucHV0KSB7XG4gICAgICAgICAgICAgICAgICAgIHJlZ2lzdHJ5LmFkZChuKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiZmlsZVwiOlxuICAgICAgICAgICAgICAgIHJlZ2lzdHJ5LmFkZEZpbGUoaW5wdXQpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICByZWdpc3RyeS5hZGQoaW5wdXQpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZWdpc3RyeTtcbn1cbi8vIGJvb3RzdHJhcC1pbmplY3QgZ29vZ2xlLnByb3RvYnVmLkVkaXRpb24uRURJVElPTl9QUk9UTzI6IGNvbnN0ICRuYW1lOiBFZGl0aW9uLiRsb2NhbE5hbWUgPSAkbnVtYmVyO1xuY29uc3QgRURJVElPTl9QUk9UTzIgPSA5OTg7XG4vLyBib290c3RyYXAtaW5qZWN0IGdvb2dsZS5wcm90b2J1Zi5FZGl0aW9uLkVESVRJT05fUFJPVE8zOiBjb25zdCAkbmFtZTogRWRpdGlvbi4kbG9jYWxOYW1lID0gJG51bWJlcjtcbmNvbnN0IEVESVRJT05fUFJPVE8zID0gOTk5O1xuLy8gYm9vdHN0cmFwLWluamVjdCBnb29nbGUucHJvdG9idWYuRmllbGREZXNjcmlwdG9yUHJvdG8uVHlwZS5UWVBFX1NUUklORzogY29uc3QgJG5hbWU6IEZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGUuJGxvY2FsTmFtZSA9ICRudW1iZXI7XG5jb25zdCBUWVBFX1NUUklORyA9IDk7XG4vLyBib290c3RyYXAtaW5qZWN0IGdvb2dsZS5wcm90b2J1Zi5GaWVsZERlc2NyaXB0b3JQcm90by5UeXBlLlRZUEVfR1JPVVA6IGNvbnN0ICRuYW1lOiBGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlLiRsb2NhbE5hbWUgPSAkbnVtYmVyO1xuY29uc3QgVFlQRV9HUk9VUCA9IDEwO1xuLy8gYm9vdHN0cmFwLWluamVjdCBnb29nbGUucHJvdG9idWYuRmllbGREZXNjcmlwdG9yUHJvdG8uVHlwZS5UWVBFX01FU1NBR0U6IGNvbnN0ICRuYW1lOiBGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlLiRsb2NhbE5hbWUgPSAkbnVtYmVyO1xuY29uc3QgVFlQRV9NRVNTQUdFID0gMTE7XG4vLyBib290c3RyYXAtaW5qZWN0IGdvb2dsZS5wcm90b2J1Zi5GaWVsZERlc2NyaXB0b3JQcm90by5UeXBlLlRZUEVfQllURVM6IGNvbnN0ICRuYW1lOiBGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlLiRsb2NhbE5hbWUgPSAkbnVtYmVyO1xuY29uc3QgVFlQRV9CWVRFUyA9IDEyO1xuLy8gYm9vdHN0cmFwLWluamVjdCBnb29nbGUucHJvdG9idWYuRmllbGREZXNjcmlwdG9yUHJvdG8uVHlwZS5UWVBFX0VOVU06IGNvbnN0ICRuYW1lOiBGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlLiRsb2NhbE5hbWUgPSAkbnVtYmVyO1xuY29uc3QgVFlQRV9FTlVNID0gMTQ7XG4vLyBib290c3RyYXAtaW5qZWN0IGdvb2dsZS5wcm90b2J1Zi5GaWVsZERlc2NyaXB0b3JQcm90by5MYWJlbC5MQUJFTF9SRVBFQVRFRDogY29uc3QgJG5hbWU6IEZpZWxkRGVzY3JpcHRvclByb3RvX0xhYmVsLiRsb2NhbE5hbWUgPSAkbnVtYmVyO1xuY29uc3QgTEFCRUxfUkVQRUFURUQgPSAzO1xuLy8gYm9vdHN0cmFwLWluamVjdCBnb29nbGUucHJvdG9idWYuRmllbGREZXNjcmlwdG9yUHJvdG8uTGFiZWwuTEFCRUxfUkVRVUlSRUQ6IGNvbnN0ICRuYW1lOiBGaWVsZERlc2NyaXB0b3JQcm90b19MYWJlbC4kbG9jYWxOYW1lID0gJG51bWJlcjtcbmNvbnN0IExBQkVMX1JFUVVJUkVEID0gMjtcbi8vIGJvb3RzdHJhcC1pbmplY3QgZ29vZ2xlLnByb3RvYnVmLkZpZWxkT3B0aW9ucy5KU1R5cGUuSlNfU1RSSU5HOiBjb25zdCAkbmFtZTogRmllbGRPcHRpb25zX0pTVHlwZS4kbG9jYWxOYW1lID0gJG51bWJlcjtcbmNvbnN0IEpTX1NUUklORyA9IDE7XG4vLyBib290c3RyYXAtaW5qZWN0IGdvb2dsZS5wcm90b2J1Zi5NZXRob2RPcHRpb25zLklkZW1wb3RlbmN5TGV2ZWwuSURFTVBPVEVOQ1lfVU5LTk9XTjogY29uc3QgJG5hbWU6IE1ldGhvZE9wdGlvbnNfSWRlbXBvdGVuY3lMZXZlbC4kbG9jYWxOYW1lID0gJG51bWJlcjtcbmNvbnN0IElERU1QT1RFTkNZX1VOS05PV04gPSAwO1xuLy8gYm9vdHN0cmFwLWluamVjdCBnb29nbGUucHJvdG9idWYuRmVhdHVyZVNldC5GaWVsZFByZXNlbmNlLkVYUExJQ0lUOiBjb25zdCAkbmFtZTogRmVhdHVyZVNldF9GaWVsZFByZXNlbmNlLiRsb2NhbE5hbWUgPSAkbnVtYmVyO1xuY29uc3QgRVhQTElDSVQgPSAxO1xuLy8gYm9vdHN0cmFwLWluamVjdCBnb29nbGUucHJvdG9idWYuRmVhdHVyZVNldC5GaWVsZFByZXNlbmNlLklNUExJQ0lUOiBjb25zdCAkbmFtZTogRmVhdHVyZVNldF9GaWVsZFByZXNlbmNlLiRsb2NhbE5hbWUgPSAkbnVtYmVyO1xuY29uc3QgSU1QTElDSVQgPSAyO1xuLy8gYm9vdHN0cmFwLWluamVjdCBnb29nbGUucHJvdG9idWYuRmVhdHVyZVNldC5GaWVsZFByZXNlbmNlLkxFR0FDWV9SRVFVSVJFRDogY29uc3QgJG5hbWU6IEZlYXR1cmVTZXRfRmllbGRQcmVzZW5jZS4kbG9jYWxOYW1lID0gJG51bWJlcjtcbmNvbnN0IExFR0FDWV9SRVFVSVJFRCA9IDM7XG4vLyBib290c3RyYXAtaW5qZWN0IGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LlJlcGVhdGVkRmllbGRFbmNvZGluZy5QQUNLRUQ6IGNvbnN0ICRuYW1lOiBGZWF0dXJlU2V0X1JlcGVhdGVkRmllbGRFbmNvZGluZy4kbG9jYWxOYW1lID0gJG51bWJlcjtcbmNvbnN0IFBBQ0tFRCA9IDE7XG4vLyBib290c3RyYXAtaW5qZWN0IGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0Lk1lc3NhZ2VFbmNvZGluZy5ERUxJTUlURUQ6IGNvbnN0ICRuYW1lOiBGZWF0dXJlU2V0X01lc3NhZ2VFbmNvZGluZy4kbG9jYWxOYW1lID0gJG51bWJlcjtcbmNvbnN0IERFTElNSVRFRCA9IDI7XG4vLyBib290c3RyYXAtaW5qZWN0IGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LkVudW1UeXBlLk9QRU46IGNvbnN0ICRuYW1lOiBGZWF0dXJlU2V0X0VudW1UeXBlLiRsb2NhbE5hbWUgPSAkbnVtYmVyO1xuY29uc3QgT1BFTiA9IDE7XG4vLyBiaW9tZS1pZ25vcmUgZm9ybWF0OiB3YW50IHRoaXMgdG8gcmVhZCB3ZWxsXG4vLyBib290c3RyYXAtaW5qZWN0IGRlZmF1bHRzOiBFRElUSU9OX1BST1RPMiB0byBFRElUSU9OXzIwMjQ6IGV4cG9ydCBjb25zdCBtaW5pbXVtRWRpdGlvbjogU3VwcG9ydGVkRWRpdGlvbiA9ICRtaW5pbXVtRWRpdGlvbiwgbWF4aW11bUVkaXRpb246IFN1cHBvcnRlZEVkaXRpb24gPSAkbWF4aW11bUVkaXRpb247XG4vLyBnZW5lcmF0ZWQgZnJvbSBwcm90b2MgdjMyLjBcbmV4cG9ydCBjb25zdCBtaW5pbXVtRWRpdGlvbiA9IDk5OCwgbWF4aW11bUVkaXRpb24gPSAxMDAxO1xuY29uc3QgZmVhdHVyZURlZmF1bHRzID0ge1xuICAgIC8vIEVESVRJT05fUFJPVE8yXG4gICAgOTk4OiB7XG4gICAgICAgIGZpZWxkUHJlc2VuY2U6IDEsIC8vIEVYUExJQ0lULFxuICAgICAgICBlbnVtVHlwZTogMiwgLy8gQ0xPU0VELFxuICAgICAgICByZXBlYXRlZEZpZWxkRW5jb2Rpbmc6IDIsIC8vIEVYUEFOREVELFxuICAgICAgICB1dGY4VmFsaWRhdGlvbjogMywgLy8gTk9ORSxcbiAgICAgICAgbWVzc2FnZUVuY29kaW5nOiAxLCAvLyBMRU5HVEhfUFJFRklYRUQsXG4gICAgICAgIGpzb25Gb3JtYXQ6IDIsIC8vIExFR0FDWV9CRVNUX0VGRk9SVCxcbiAgICAgICAgZW5mb3JjZU5hbWluZ1N0eWxlOiAyLCAvLyBTVFlMRV9MRUdBQ1ksXG4gICAgICAgIGRlZmF1bHRTeW1ib2xWaXNpYmlsaXR5OiAxLCAvLyBFWFBPUlRfQUxMLFxuICAgIH0sXG4gICAgLy8gRURJVElPTl9QUk9UTzNcbiAgICA5OTk6IHtcbiAgICAgICAgZmllbGRQcmVzZW5jZTogMiwgLy8gSU1QTElDSVQsXG4gICAgICAgIGVudW1UeXBlOiAxLCAvLyBPUEVOLFxuICAgICAgICByZXBlYXRlZEZpZWxkRW5jb2Rpbmc6IDEsIC8vIFBBQ0tFRCxcbiAgICAgICAgdXRmOFZhbGlkYXRpb246IDIsIC8vIFZFUklGWSxcbiAgICAgICAgbWVzc2FnZUVuY29kaW5nOiAxLCAvLyBMRU5HVEhfUFJFRklYRUQsXG4gICAgICAgIGpzb25Gb3JtYXQ6IDEsIC8vIEFMTE9XLFxuICAgICAgICBlbmZvcmNlTmFtaW5nU3R5bGU6IDIsIC8vIFNUWUxFX0xFR0FDWSxcbiAgICAgICAgZGVmYXVsdFN5bWJvbFZpc2liaWxpdHk6IDEsIC8vIEVYUE9SVF9BTEwsXG4gICAgfSxcbiAgICAvLyBFRElUSU9OXzIwMjNcbiAgICAxMDAwOiB7XG4gICAgICAgIGZpZWxkUHJlc2VuY2U6IDEsIC8vIEVYUExJQ0lULFxuICAgICAgICBlbnVtVHlwZTogMSwgLy8gT1BFTixcbiAgICAgICAgcmVwZWF0ZWRGaWVsZEVuY29kaW5nOiAxLCAvLyBQQUNLRUQsXG4gICAgICAgIHV0ZjhWYWxpZGF0aW9uOiAyLCAvLyBWRVJJRlksXG4gICAgICAgIG1lc3NhZ2VFbmNvZGluZzogMSwgLy8gTEVOR1RIX1BSRUZJWEVELFxuICAgICAgICBqc29uRm9ybWF0OiAxLCAvLyBBTExPVyxcbiAgICAgICAgZW5mb3JjZU5hbWluZ1N0eWxlOiAyLCAvLyBTVFlMRV9MRUdBQ1ksXG4gICAgICAgIGRlZmF1bHRTeW1ib2xWaXNpYmlsaXR5OiAxLCAvLyBFWFBPUlRfQUxMLFxuICAgIH0sXG4gICAgLy8gRURJVElPTl8yMDI0XG4gICAgMTAwMToge1xuICAgICAgICBmaWVsZFByZXNlbmNlOiAxLCAvLyBFWFBMSUNJVCxcbiAgICAgICAgZW51bVR5cGU6IDEsIC8vIE9QRU4sXG4gICAgICAgIHJlcGVhdGVkRmllbGRFbmNvZGluZzogMSwgLy8gUEFDS0VELFxuICAgICAgICB1dGY4VmFsaWRhdGlvbjogMiwgLy8gVkVSSUZZLFxuICAgICAgICBtZXNzYWdlRW5jb2Rpbmc6IDEsIC8vIExFTkdUSF9QUkVGSVhFRCxcbiAgICAgICAganNvbkZvcm1hdDogMSwgLy8gQUxMT1csXG4gICAgICAgIGVuZm9yY2VOYW1pbmdTdHlsZTogMSwgLy8gU1RZTEUyMDI0LFxuICAgICAgICBkZWZhdWx0U3ltYm9sVmlzaWJpbGl0eTogMiwgLy8gRVhQT1JUX1RPUF9MRVZFTCxcbiAgICB9LFxufTtcbi8qKlxuICogQ3JlYXRlIGEgZGVzY3JpcHRvciBmb3IgYSBmaWxlLCBhZGQgaXQgdG8gdGhlIHJlZ2lzdHJ5LlxuICovXG5mdW5jdGlvbiBhZGRGaWxlKHByb3RvLCByZWcpIHtcbiAgICB2YXIgX2EsIF9iO1xuICAgIGNvbnN0IGZpbGUgPSB7XG4gICAgICAgIGtpbmQ6IFwiZmlsZVwiLFxuICAgICAgICBwcm90byxcbiAgICAgICAgZGVwcmVjYXRlZDogKF9iID0gKF9hID0gcHJvdG8ub3B0aW9ucykgPT09IG51bGwgfHwgX2EgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9hLmRlcHJlY2F0ZWQpICE9PSBudWxsICYmIF9iICE9PSB2b2lkIDAgPyBfYiA6IGZhbHNlLFxuICAgICAgICBlZGl0aW9uOiBnZXRGaWxlRWRpdGlvbihwcm90byksXG4gICAgICAgIG5hbWU6IHByb3RvLm5hbWUucmVwbGFjZSgvXFwucHJvdG8kLywgXCJcIiksXG4gICAgICAgIGRlcGVuZGVuY2llczogZmluZEZpbGVEZXBlbmRlbmNpZXMocHJvdG8sIHJlZyksXG4gICAgICAgIGVudW1zOiBbXSxcbiAgICAgICAgbWVzc2FnZXM6IFtdLFxuICAgICAgICBleHRlbnNpb25zOiBbXSxcbiAgICAgICAgc2VydmljZXM6IFtdLFxuICAgICAgICB0b1N0cmluZygpIHtcbiAgICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvcmVzdHJpY3QtdGVtcGxhdGUtZXhwcmVzc2lvbnMgLS0gd2UgYXNzZXJ0ZWQgYWJvdmVcbiAgICAgICAgICAgIHJldHVybiBgZmlsZSAke3Byb3RvLm5hbWV9YDtcbiAgICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IG1hcEVudHJpZXNTdG9yZSA9IG5ldyBNYXAoKTtcbiAgICBjb25zdCBtYXBFbnRyaWVzID0ge1xuICAgICAgICBnZXQodHlwZU5hbWUpIHtcbiAgICAgICAgICAgIHJldHVybiBtYXBFbnRyaWVzU3RvcmUuZ2V0KHR5cGVOYW1lKTtcbiAgICAgICAgfSxcbiAgICAgICAgYWRkKGRlc2MpIHtcbiAgICAgICAgICAgIHZhciBfYTtcbiAgICAgICAgICAgIGFzc2VydCgoKF9hID0gZGVzYy5wcm90by5vcHRpb25zKSA9PT0gbnVsbCB8fCBfYSA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2EubWFwRW50cnkpID09PSB0cnVlKTtcbiAgICAgICAgICAgIG1hcEVudHJpZXNTdG9yZS5zZXQoZGVzYy50eXBlTmFtZSwgZGVzYyk7XG4gICAgICAgIH0sXG4gICAgfTtcbiAgICBmb3IgKGNvbnN0IGVudW1Qcm90byBvZiBwcm90by5lbnVtVHlwZSkge1xuICAgICAgICBhZGRFbnVtKGVudW1Qcm90bywgZmlsZSwgdW5kZWZpbmVkLCByZWcpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IG1lc3NhZ2VQcm90byBvZiBwcm90by5tZXNzYWdlVHlwZSkge1xuICAgICAgICBhZGRNZXNzYWdlKG1lc3NhZ2VQcm90bywgZmlsZSwgdW5kZWZpbmVkLCByZWcsIG1hcEVudHJpZXMpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHNlcnZpY2VQcm90byBvZiBwcm90by5zZXJ2aWNlKSB7XG4gICAgICAgIGFkZFNlcnZpY2Uoc2VydmljZVByb3RvLCBmaWxlLCByZWcpO1xuICAgIH1cbiAgICBhZGRFeHRlbnNpb25zKGZpbGUsIHJlZyk7XG4gICAgZm9yIChjb25zdCBtYXBFbnRyeSBvZiBtYXBFbnRyaWVzU3RvcmUudmFsdWVzKCkpIHtcbiAgICAgICAgLy8gdG8gY3JlYXRlIGEgbWFwIGZpZWxkLCB3ZSBuZWVkIGFjY2VzcyB0byB0aGUgbWFwIGVudHJ5J3MgZmllbGRzXG4gICAgICAgIGFkZEZpZWxkcyhtYXBFbnRyeSwgcmVnLCBtYXBFbnRyaWVzKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBtZXNzYWdlIG9mIGZpbGUubWVzc2FnZXMpIHtcbiAgICAgICAgYWRkRmllbGRzKG1lc3NhZ2UsIHJlZywgbWFwRW50cmllcyk7XG4gICAgICAgIGFkZEV4dGVuc2lvbnMobWVzc2FnZSwgcmVnKTtcbiAgICB9XG4gICAgcmVnLmFkZEZpbGUoZmlsZSwgdHJ1ZSk7XG59XG4vKipcbiAqIENyZWF0ZSBkZXNjcmlwdG9ycyBmb3IgZXh0ZW5zaW9ucywgYW5kIGFkZCB0aGVtIHRvIHRoZSBtZXNzYWdlIC8gZmlsZSxcbiAqIGFuZCB0byBvdXIgY2FydC5cbiAqIFJlY3Vyc2VzIGludG8gbmVzdGVkIHR5cGVzLlxuICovXG5mdW5jdGlvbiBhZGRFeHRlbnNpb25zKGRlc2MsIHJlZykge1xuICAgIHN3aXRjaCAoZGVzYy5raW5kKSB7XG4gICAgICAgIGNhc2UgXCJmaWxlXCI6XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHByb3RvIG9mIGRlc2MucHJvdG8uZXh0ZW5zaW9uKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZXh0ID0gbmV3RmllbGQocHJvdG8sIGRlc2MsIHJlZyk7XG4gICAgICAgICAgICAgICAgZGVzYy5leHRlbnNpb25zLnB1c2goZXh0KTtcbiAgICAgICAgICAgICAgICByZWcuYWRkKGV4dCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIm1lc3NhZ2VcIjpcbiAgICAgICAgICAgIGZvciAoY29uc3QgcHJvdG8gb2YgZGVzYy5wcm90by5leHRlbnNpb24pIHtcbiAgICAgICAgICAgICAgICBjb25zdCBleHQgPSBuZXdGaWVsZChwcm90bywgZGVzYywgcmVnKTtcbiAgICAgICAgICAgICAgICBkZXNjLm5lc3RlZEV4dGVuc2lvbnMucHVzaChleHQpO1xuICAgICAgICAgICAgICAgIHJlZy5hZGQoZXh0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAoY29uc3QgbWVzc2FnZSBvZiBkZXNjLm5lc3RlZE1lc3NhZ2VzKSB7XG4gICAgICAgICAgICAgICAgYWRkRXh0ZW5zaW9ucyhtZXNzYWdlLCByZWcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxufVxuLyoqXG4gKiBDcmVhdGUgZGVzY3JpcHRvcnMgZm9yIGZpZWxkcyBhbmQgb25lb2YgZ3JvdXBzLCBhbmQgYWRkIHRoZW0gdG8gdGhlIG1lc3NhZ2UuXG4gKiBSZWN1cnNlcyBpbnRvIG5lc3RlZCB0eXBlcy5cbiAqL1xuZnVuY3Rpb24gYWRkRmllbGRzKG1lc3NhZ2UsIHJlZywgbWFwRW50cmllcykge1xuICAgIGNvbnN0IGFsbE9uZW9mcyA9IG1lc3NhZ2UucHJvdG8ub25lb2ZEZWNsLm1hcCgocHJvdG8pID0+IG5ld09uZW9mKHByb3RvLCBtZXNzYWdlKSk7XG4gICAgY29uc3Qgb25lb2ZzU2VlbiA9IG5ldyBTZXQoKTtcbiAgICBmb3IgKGNvbnN0IHByb3RvIG9mIG1lc3NhZ2UucHJvdG8uZmllbGQpIHtcbiAgICAgICAgY29uc3Qgb25lb2YgPSBmaW5kT25lb2YocHJvdG8sIGFsbE9uZW9mcyk7XG4gICAgICAgIGNvbnN0IGZpZWxkID0gbmV3RmllbGQocHJvdG8sIG1lc3NhZ2UsIHJlZywgb25lb2YsIG1hcEVudHJpZXMpO1xuICAgICAgICBtZXNzYWdlLmZpZWxkcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgbWVzc2FnZS5maWVsZFtmaWVsZC5sb2NhbE5hbWVdID0gZmllbGQ7XG4gICAgICAgIGlmIChvbmVvZiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBtZXNzYWdlLm1lbWJlcnMucHVzaChmaWVsZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBvbmVvZi5maWVsZHMucHVzaChmaWVsZCk7XG4gICAgICAgICAgICBpZiAoIW9uZW9mc1NlZW4uaGFzKG9uZW9mKSkge1xuICAgICAgICAgICAgICAgIG9uZW9mc1NlZW4uYWRkKG9uZW9mKTtcbiAgICAgICAgICAgICAgICBtZXNzYWdlLm1lbWJlcnMucHVzaChvbmVvZik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yIChjb25zdCBvbmVvZiBvZiBhbGxPbmVvZnMuZmlsdGVyKChvKSA9PiBvbmVvZnNTZWVuLmhhcyhvKSkpIHtcbiAgICAgICAgbWVzc2FnZS5vbmVvZnMucHVzaChvbmVvZik7XG4gICAgfVxuICAgIGZvciAoY29uc3QgY2hpbGQgb2YgbWVzc2FnZS5uZXN0ZWRNZXNzYWdlcykge1xuICAgICAgICBhZGRGaWVsZHMoY2hpbGQsIHJlZywgbWFwRW50cmllcyk7XG4gICAgfVxufVxuLyoqXG4gKiBDcmVhdGUgYSBkZXNjcmlwdG9yIGZvciBhbiBlbnVtZXJhdGlvbiwgYW5kIGFkZCBpdCBvdXIgY2FydCBhbmQgdG8gdGhlXG4gKiBwYXJlbnQgdHlwZSwgaWYgYW55LlxuICovXG5mdW5jdGlvbiBhZGRFbnVtKHByb3RvLCBmaWxlLCBwYXJlbnQsIHJlZykge1xuICAgIHZhciBfYSwgX2IsIF9jLCBfZCwgX2U7XG4gICAgY29uc3Qgc2hhcmVkUHJlZml4ID0gZmluZEVudW1TaGFyZWRQcmVmaXgocHJvdG8ubmFtZSwgcHJvdG8udmFsdWUpO1xuICAgIGNvbnN0IGRlc2MgPSB7XG4gICAgICAgIGtpbmQ6IFwiZW51bVwiLFxuICAgICAgICBwcm90byxcbiAgICAgICAgZGVwcmVjYXRlZDogKF9iID0gKF9hID0gcHJvdG8ub3B0aW9ucykgPT09IG51bGwgfHwgX2EgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9hLmRlcHJlY2F0ZWQpICE9PSBudWxsICYmIF9iICE9PSB2b2lkIDAgPyBfYiA6IGZhbHNlLFxuICAgICAgICBmaWxlLFxuICAgICAgICBwYXJlbnQsXG4gICAgICAgIG9wZW46IHRydWUsXG4gICAgICAgIG5hbWU6IHByb3RvLm5hbWUsXG4gICAgICAgIHR5cGVOYW1lOiBtYWtlVHlwZU5hbWUocHJvdG8sIHBhcmVudCwgZmlsZSksXG4gICAgICAgIHZhbHVlOiB7fSxcbiAgICAgICAgdmFsdWVzOiBbXSxcbiAgICAgICAgc2hhcmVkUHJlZml4LFxuICAgICAgICB0b1N0cmluZygpIHtcbiAgICAgICAgICAgIHJldHVybiBgZW51bSAke3RoaXMudHlwZU5hbWV9YDtcbiAgICAgICAgfSxcbiAgICB9O1xuICAgIGRlc2Mub3BlbiA9IGlzRW51bU9wZW4oZGVzYyk7XG4gICAgcmVnLmFkZChkZXNjKTtcbiAgICBmb3IgKGNvbnN0IHAgb2YgcHJvdG8udmFsdWUpIHtcbiAgICAgICAgY29uc3QgbmFtZSA9IHAubmFtZTtcbiAgICAgICAgZGVzYy52YWx1ZXMucHVzaChcbiAgICAgICAgLy8gYmlvbWUtaWdub3JlIGxpbnQvc3VzcGljaW91cy9ub0Fzc2lnbkluRXhwcmVzc2lvbnM6IG5vXG4gICAgICAgIChkZXNjLnZhbHVlW3AubnVtYmVyXSA9IHtcbiAgICAgICAgICAgIGtpbmQ6IFwiZW51bV92YWx1ZVwiLFxuICAgICAgICAgICAgcHJvdG86IHAsXG4gICAgICAgICAgICBkZXByZWNhdGVkOiAoX2QgPSAoX2MgPSBwLm9wdGlvbnMpID09PSBudWxsIHx8IF9jID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfYy5kZXByZWNhdGVkKSAhPT0gbnVsbCAmJiBfZCAhPT0gdm9pZCAwID8gX2QgOiBmYWxzZSxcbiAgICAgICAgICAgIHBhcmVudDogZGVzYyxcbiAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICBsb2NhbE5hbWU6IHNhZmVPYmplY3RQcm9wZXJ0eShzaGFyZWRQcmVmaXggPT0gdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgPyBuYW1lXG4gICAgICAgICAgICAgICAgOiBuYW1lLnN1YnN0cmluZyhzaGFyZWRQcmVmaXgubGVuZ3RoKSksXG4gICAgICAgICAgICBudW1iZXI6IHAubnVtYmVyLFxuICAgICAgICAgICAgdG9TdHJpbmcoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGBlbnVtIHZhbHVlICR7ZGVzYy50eXBlTmFtZX0uJHtuYW1lfWA7XG4gICAgICAgICAgICB9LFxuICAgICAgICB9KSk7XG4gICAgfVxuICAgICgoX2UgPSBwYXJlbnQgPT09IG51bGwgfHwgcGFyZW50ID09PSB2b2lkIDAgPyB2b2lkIDAgOiBwYXJlbnQubmVzdGVkRW51bXMpICE9PSBudWxsICYmIF9lICE9PSB2b2lkIDAgPyBfZSA6IGZpbGUuZW51bXMpLnB1c2goZGVzYyk7XG59XG4vKipcbiAqIENyZWF0ZSBhIGRlc2NyaXB0b3IgZm9yIGEgbWVzc2FnZSwgaW5jbHVkaW5nIG5lc3RlZCB0eXBlcywgYW5kIGFkZCBpdCB0byBvdXJcbiAqIGNhcnQuIE5vdGUgdGhhdCB0aGlzIGRvZXMgbm90IGNyZWF0ZSBkZXNjcmlwdG9ycyBmaWVsZHMuXG4gKi9cbmZ1bmN0aW9uIGFkZE1lc3NhZ2UocHJvdG8sIGZpbGUsIHBhcmVudCwgcmVnLCBtYXBFbnRyaWVzKSB7XG4gICAgdmFyIF9hLCBfYiwgX2MsIF9kO1xuICAgIGNvbnN0IGRlc2MgPSB7XG4gICAgICAgIGtpbmQ6IFwibWVzc2FnZVwiLFxuICAgICAgICBwcm90byxcbiAgICAgICAgZGVwcmVjYXRlZDogKF9iID0gKF9hID0gcHJvdG8ub3B0aW9ucykgPT09IG51bGwgfHwgX2EgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9hLmRlcHJlY2F0ZWQpICE9PSBudWxsICYmIF9iICE9PSB2b2lkIDAgPyBfYiA6IGZhbHNlLFxuICAgICAgICBmaWxlLFxuICAgICAgICBwYXJlbnQsXG4gICAgICAgIG5hbWU6IHByb3RvLm5hbWUsXG4gICAgICAgIHR5cGVOYW1lOiBtYWtlVHlwZU5hbWUocHJvdG8sIHBhcmVudCwgZmlsZSksXG4gICAgICAgIGZpZWxkczogW10sXG4gICAgICAgIGZpZWxkOiB7fSxcbiAgICAgICAgb25lb2ZzOiBbXSxcbiAgICAgICAgbWVtYmVyczogW10sXG4gICAgICAgIG5lc3RlZEVudW1zOiBbXSxcbiAgICAgICAgbmVzdGVkTWVzc2FnZXM6IFtdLFxuICAgICAgICBuZXN0ZWRFeHRlbnNpb25zOiBbXSxcbiAgICAgICAgdG9TdHJpbmcoKSB7XG4gICAgICAgICAgICByZXR1cm4gYG1lc3NhZ2UgJHt0aGlzLnR5cGVOYW1lfWA7XG4gICAgICAgIH0sXG4gICAgfTtcbiAgICBpZiAoKChfYyA9IHByb3RvLm9wdGlvbnMpID09PSBudWxsIHx8IF9jID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfYy5tYXBFbnRyeSkgPT09IHRydWUpIHtcbiAgICAgICAgbWFwRW50cmllcy5hZGQoZGVzYyk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICAoKF9kID0gcGFyZW50ID09PSBudWxsIHx8IHBhcmVudCA9PT0gdm9pZCAwID8gdm9pZCAwIDogcGFyZW50Lm5lc3RlZE1lc3NhZ2VzKSAhPT0gbnVsbCAmJiBfZCAhPT0gdm9pZCAwID8gX2QgOiBmaWxlLm1lc3NhZ2VzKS5wdXNoKGRlc2MpO1xuICAgICAgICByZWcuYWRkKGRlc2MpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGVudW1Qcm90byBvZiBwcm90by5lbnVtVHlwZSkge1xuICAgICAgICBhZGRFbnVtKGVudW1Qcm90bywgZmlsZSwgZGVzYywgcmVnKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBtZXNzYWdlUHJvdG8gb2YgcHJvdG8ubmVzdGVkVHlwZSkge1xuICAgICAgICBhZGRNZXNzYWdlKG1lc3NhZ2VQcm90bywgZmlsZSwgZGVzYywgcmVnLCBtYXBFbnRyaWVzKTtcbiAgICB9XG59XG4vKipcbiAqIENyZWF0ZSBhIGRlc2NyaXB0b3IgZm9yIGEgc2VydmljZSwgaW5jbHVkaW5nIG1ldGhvZHMsIGFuZCBhZGQgaXQgdG8gb3VyXG4gKiBjYXJ0LlxuICovXG5mdW5jdGlvbiBhZGRTZXJ2aWNlKHByb3RvLCBmaWxlLCByZWcpIHtcbiAgICB2YXIgX2EsIF9iO1xuICAgIGNvbnN0IGRlc2MgPSB7XG4gICAgICAgIGtpbmQ6IFwic2VydmljZVwiLFxuICAgICAgICBwcm90byxcbiAgICAgICAgZGVwcmVjYXRlZDogKF9iID0gKF9hID0gcHJvdG8ub3B0aW9ucykgPT09IG51bGwgfHwgX2EgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9hLmRlcHJlY2F0ZWQpICE9PSBudWxsICYmIF9iICE9PSB2b2lkIDAgPyBfYiA6IGZhbHNlLFxuICAgICAgICBmaWxlLFxuICAgICAgICBuYW1lOiBwcm90by5uYW1lLFxuICAgICAgICB0eXBlTmFtZTogbWFrZVR5cGVOYW1lKHByb3RvLCB1bmRlZmluZWQsIGZpbGUpLFxuICAgICAgICBtZXRob2RzOiBbXSxcbiAgICAgICAgbWV0aG9kOiB7fSxcbiAgICAgICAgdG9TdHJpbmcoKSB7XG4gICAgICAgICAgICByZXR1cm4gYHNlcnZpY2UgJHt0aGlzLnR5cGVOYW1lfWA7XG4gICAgICAgIH0sXG4gICAgfTtcbiAgICBmaWxlLnNlcnZpY2VzLnB1c2goZGVzYyk7XG4gICAgcmVnLmFkZChkZXNjKTtcbiAgICBmb3IgKGNvbnN0IG1ldGhvZFByb3RvIG9mIHByb3RvLm1ldGhvZCkge1xuICAgICAgICBjb25zdCBtZXRob2QgPSBuZXdNZXRob2QobWV0aG9kUHJvdG8sIGRlc2MsIHJlZyk7XG4gICAgICAgIGRlc2MubWV0aG9kcy5wdXNoKG1ldGhvZCk7XG4gICAgICAgIGRlc2MubWV0aG9kW21ldGhvZC5sb2NhbE5hbWVdID0gbWV0aG9kO1xuICAgIH1cbn1cbi8qKlxuICogQ3JlYXRlIGEgZGVzY3JpcHRvciBmb3IgYSBtZXRob2QuXG4gKi9cbmZ1bmN0aW9uIG5ld01ldGhvZChwcm90bywgcGFyZW50LCByZWcpIHtcbiAgICB2YXIgX2EsIF9iLCBfYywgX2Q7XG4gICAgbGV0IG1ldGhvZEtpbmQ7XG4gICAgaWYgKHByb3RvLmNsaWVudFN0cmVhbWluZyAmJiBwcm90by5zZXJ2ZXJTdHJlYW1pbmcpIHtcbiAgICAgICAgbWV0aG9kS2luZCA9IFwiYmlkaV9zdHJlYW1pbmdcIjtcbiAgICB9XG4gICAgZWxzZSBpZiAocHJvdG8uY2xpZW50U3RyZWFtaW5nKSB7XG4gICAgICAgIG1ldGhvZEtpbmQgPSBcImNsaWVudF9zdHJlYW1pbmdcIjtcbiAgICB9XG4gICAgZWxzZSBpZiAocHJvdG8uc2VydmVyU3RyZWFtaW5nKSB7XG4gICAgICAgIG1ldGhvZEtpbmQgPSBcInNlcnZlcl9zdHJlYW1pbmdcIjtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIG1ldGhvZEtpbmQgPSBcInVuYXJ5XCI7XG4gICAgfVxuICAgIGNvbnN0IGlucHV0ID0gcmVnLmdldE1lc3NhZ2UodHJpbUxlYWRpbmdEb3QocHJvdG8uaW5wdXRUeXBlKSk7XG4gICAgY29uc3Qgb3V0cHV0ID0gcmVnLmdldE1lc3NhZ2UodHJpbUxlYWRpbmdEb3QocHJvdG8ub3V0cHV0VHlwZSkpO1xuICAgIGFzc2VydChpbnB1dCwgYGludmFsaWQgTWV0aG9kRGVzY3JpcHRvclByb3RvOiBpbnB1dF90eXBlICR7cHJvdG8uaW5wdXRUeXBlfSBub3QgZm91bmRgKTtcbiAgICBhc3NlcnQob3V0cHV0LCBgaW52YWxpZCBNZXRob2REZXNjcmlwdG9yUHJvdG86IG91dHB1dF90eXBlICR7cHJvdG8uaW5wdXRUeXBlfSBub3QgZm91bmRgKTtcbiAgICBjb25zdCBuYW1lID0gcHJvdG8ubmFtZTtcbiAgICByZXR1cm4ge1xuICAgICAgICBraW5kOiBcInJwY1wiLFxuICAgICAgICBwcm90byxcbiAgICAgICAgZGVwcmVjYXRlZDogKF9iID0gKF9hID0gcHJvdG8ub3B0aW9ucykgPT09IG51bGwgfHwgX2EgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9hLmRlcHJlY2F0ZWQpICE9PSBudWxsICYmIF9iICE9PSB2b2lkIDAgPyBfYiA6IGZhbHNlLFxuICAgICAgICBwYXJlbnQsXG4gICAgICAgIG5hbWUsXG4gICAgICAgIGxvY2FsTmFtZTogc2FmZU9iamVjdFByb3BlcnR5KG5hbWUubGVuZ3RoXG4gICAgICAgICAgICA/IHNhZmVPYmplY3RQcm9wZXJ0eShuYW1lWzBdLnRvTG93ZXJDYXNlKCkgKyBuYW1lLnN1YnN0cmluZygxKSlcbiAgICAgICAgICAgIDogbmFtZSksXG4gICAgICAgIG1ldGhvZEtpbmQsXG4gICAgICAgIGlucHV0LFxuICAgICAgICBvdXRwdXQsXG4gICAgICAgIGlkZW1wb3RlbmN5OiAoX2QgPSAoX2MgPSBwcm90by5vcHRpb25zKSA9PT0gbnVsbCB8fCBfYyA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2MuaWRlbXBvdGVuY3lMZXZlbCkgIT09IG51bGwgJiYgX2QgIT09IHZvaWQgMCA/IF9kIDogSURFTVBPVEVOQ1lfVU5LTk9XTixcbiAgICAgICAgdG9TdHJpbmcoKSB7XG4gICAgICAgICAgICByZXR1cm4gYHJwYyAke3BhcmVudC50eXBlTmFtZX0uJHtuYW1lfWA7XG4gICAgICAgIH0sXG4gICAgfTtcbn1cbi8qKlxuICogQ3JlYXRlIGEgZGVzY3JpcHRvciBmb3IgYSBvbmVvZiBncm91cC5cbiAqL1xuZnVuY3Rpb24gbmV3T25lb2YocHJvdG8sIHBhcmVudCkge1xuICAgIHJldHVybiB7XG4gICAgICAgIGtpbmQ6IFwib25lb2ZcIixcbiAgICAgICAgcHJvdG8sXG4gICAgICAgIGRlcHJlY2F0ZWQ6IGZhbHNlLFxuICAgICAgICBwYXJlbnQsXG4gICAgICAgIGZpZWxkczogW10sXG4gICAgICAgIG5hbWU6IHByb3RvLm5hbWUsXG4gICAgICAgIGxvY2FsTmFtZTogc2FmZU9iamVjdFByb3BlcnR5KHByb3RvQ2FtZWxDYXNlKHByb3RvLm5hbWUpKSxcbiAgICAgICAgdG9TdHJpbmcoKSB7XG4gICAgICAgICAgICByZXR1cm4gYG9uZW9mICR7cGFyZW50LnR5cGVOYW1lfS4ke3RoaXMubmFtZX1gO1xuICAgICAgICB9LFxuICAgIH07XG59XG5mdW5jdGlvbiBuZXdGaWVsZChwcm90bywgcGFyZW50T3JGaWxlLCByZWcsIG9uZW9mLCBtYXBFbnRyaWVzKSB7XG4gICAgdmFyIF9hLCBfYiwgX2M7XG4gICAgY29uc3QgaXNFeHRlbnNpb24gPSBtYXBFbnRyaWVzID09PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgZmllbGQgPSB7XG4gICAgICAgIGtpbmQ6IFwiZmllbGRcIixcbiAgICAgICAgcHJvdG8sXG4gICAgICAgIGRlcHJlY2F0ZWQ6IChfYiA9IChfYSA9IHByb3RvLm9wdGlvbnMpID09PSBudWxsIHx8IF9hID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfYS5kZXByZWNhdGVkKSAhPT0gbnVsbCAmJiBfYiAhPT0gdm9pZCAwID8gX2IgOiBmYWxzZSxcbiAgICAgICAgbmFtZTogcHJvdG8ubmFtZSxcbiAgICAgICAgbnVtYmVyOiBwcm90by5udW1iZXIsXG4gICAgICAgIHNjYWxhcjogdW5kZWZpbmVkLFxuICAgICAgICBtZXNzYWdlOiB1bmRlZmluZWQsXG4gICAgICAgIGVudW06IHVuZGVmaW5lZCxcbiAgICAgICAgcHJlc2VuY2U6IGdldEZpZWxkUHJlc2VuY2UocHJvdG8sIG9uZW9mLCBpc0V4dGVuc2lvbiwgcGFyZW50T3JGaWxlKSxcbiAgICAgICAgbGlzdEtpbmQ6IHVuZGVmaW5lZCxcbiAgICAgICAgbWFwS2luZDogdW5kZWZpbmVkLFxuICAgICAgICBtYXBLZXk6IHVuZGVmaW5lZCxcbiAgICAgICAgZGVsaW1pdGVkRW5jb2Rpbmc6IHVuZGVmaW5lZCxcbiAgICAgICAgcGFja2VkOiB1bmRlZmluZWQsXG4gICAgICAgIGxvbmdBc1N0cmluZzogZmFsc2UsXG4gICAgICAgIGdldERlZmF1bHRWYWx1ZTogdW5kZWZpbmVkLFxuICAgIH07XG4gICAgaWYgKGlzRXh0ZW5zaW9uKSB7XG4gICAgICAgIC8vIGV4dGVuc2lvbiBmaWVsZFxuICAgICAgICBjb25zdCBmaWxlID0gcGFyZW50T3JGaWxlLmtpbmQgPT0gXCJmaWxlXCIgPyBwYXJlbnRPckZpbGUgOiBwYXJlbnRPckZpbGUuZmlsZTtcbiAgICAgICAgY29uc3QgcGFyZW50ID0gcGFyZW50T3JGaWxlLmtpbmQgPT0gXCJmaWxlXCIgPyB1bmRlZmluZWQgOiBwYXJlbnRPckZpbGU7XG4gICAgICAgIGNvbnN0IHR5cGVOYW1lID0gbWFrZVR5cGVOYW1lKHByb3RvLCBwYXJlbnQsIGZpbGUpO1xuICAgICAgICBmaWVsZC5raW5kID0gXCJleHRlbnNpb25cIjtcbiAgICAgICAgZmllbGQuZmlsZSA9IGZpbGU7XG4gICAgICAgIGZpZWxkLnBhcmVudCA9IHBhcmVudDtcbiAgICAgICAgZmllbGQub25lb2YgPSB1bmRlZmluZWQ7XG4gICAgICAgIGZpZWxkLnR5cGVOYW1lID0gdHlwZU5hbWU7XG4gICAgICAgIGZpZWxkLmpzb25OYW1lID0gYFske3R5cGVOYW1lfV1gOyAvLyBvcHRpb24ganNvbl9uYW1lIGlzIG5vdCBhbGxvd2VkIG9uIGV4dGVuc2lvbiBmaWVsZHNcbiAgICAgICAgZmllbGQudG9TdHJpbmcgPSAoKSA9PiBgZXh0ZW5zaW9uICR7dHlwZU5hbWV9YDtcbiAgICAgICAgY29uc3QgZXh0ZW5kZWUgPSByZWcuZ2V0TWVzc2FnZSh0cmltTGVhZGluZ0RvdChwcm90by5leHRlbmRlZSkpO1xuICAgICAgICBhc3NlcnQoZXh0ZW5kZWUsIGBpbnZhbGlkIEZpZWxkRGVzY3JpcHRvclByb3RvOiBleHRlbmRlZSAke3Byb3RvLmV4dGVuZGVlfSBub3QgZm91bmRgKTtcbiAgICAgICAgZmllbGQuZXh0ZW5kZWUgPSBleHRlbmRlZTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIC8vIHJlZ3VsYXIgZmllbGRcbiAgICAgICAgY29uc3QgcGFyZW50ID0gcGFyZW50T3JGaWxlO1xuICAgICAgICBhc3NlcnQocGFyZW50LmtpbmQgPT0gXCJtZXNzYWdlXCIpO1xuICAgICAgICBmaWVsZC5wYXJlbnQgPSBwYXJlbnQ7XG4gICAgICAgIGZpZWxkLm9uZW9mID0gb25lb2Y7XG4gICAgICAgIGZpZWxkLmxvY2FsTmFtZSA9IG9uZW9mXG4gICAgICAgICAgICA/IHByb3RvQ2FtZWxDYXNlKHByb3RvLm5hbWUpXG4gICAgICAgICAgICA6IHNhZmVPYmplY3RQcm9wZXJ0eShwcm90b0NhbWVsQ2FzZShwcm90by5uYW1lKSk7XG4gICAgICAgIGZpZWxkLmpzb25OYW1lID0gcHJvdG8uanNvbk5hbWU7XG4gICAgICAgIGZpZWxkLnRvU3RyaW5nID0gKCkgPT4gYGZpZWxkICR7cGFyZW50LnR5cGVOYW1lfS4ke3Byb3RvLm5hbWV9YDtcbiAgICB9XG4gICAgY29uc3QgbGFiZWwgPSBwcm90by5sYWJlbDtcbiAgICBjb25zdCB0eXBlID0gcHJvdG8udHlwZTtcbiAgICBjb25zdCBqc3R5cGUgPSAoX2MgPSBwcm90by5vcHRpb25zKSA9PT0gbnVsbCB8fCBfYyA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2MuanN0eXBlO1xuICAgIGlmIChsYWJlbCA9PT0gTEFCRUxfUkVQRUFURUQpIHtcbiAgICAgICAgLy8gbGlzdCBvciBtYXAgZmllbGRcbiAgICAgICAgY29uc3QgbWFwRW50cnkgPSB0eXBlID09IFRZUEVfTUVTU0FHRVxuICAgICAgICAgICAgPyBtYXBFbnRyaWVzID09PSBudWxsIHx8IG1hcEVudHJpZXMgPT09IHZvaWQgMCA/IHZvaWQgMCA6IG1hcEVudHJpZXMuZ2V0KHRyaW1MZWFkaW5nRG90KHByb3RvLnR5cGVOYW1lKSlcbiAgICAgICAgICAgIDogdW5kZWZpbmVkO1xuICAgICAgICBpZiAobWFwRW50cnkpIHtcbiAgICAgICAgICAgIC8vIG1hcCBmaWVsZFxuICAgICAgICAgICAgZmllbGQuZmllbGRLaW5kID0gXCJtYXBcIjtcbiAgICAgICAgICAgIGNvbnN0IHsga2V5LCB2YWx1ZSB9ID0gZmluZE1hcEVudHJ5RmllbGRzKG1hcEVudHJ5KTtcbiAgICAgICAgICAgIGZpZWxkLm1hcEtleSA9IGtleS5zY2FsYXI7XG4gICAgICAgICAgICBmaWVsZC5tYXBLaW5kID0gdmFsdWUuZmllbGRLaW5kO1xuICAgICAgICAgICAgZmllbGQubWVzc2FnZSA9IHZhbHVlLm1lc3NhZ2U7XG4gICAgICAgICAgICBmaWVsZC5kZWxpbWl0ZWRFbmNvZGluZyA9IGZhbHNlOyAvLyBtYXAgZmllbGRzIGFyZSBhbHdheXMgTEVOR1RIX1BSRUZJWEVEXG4gICAgICAgICAgICBmaWVsZC5lbnVtID0gdmFsdWUuZW51bTtcbiAgICAgICAgICAgIGZpZWxkLnNjYWxhciA9IHZhbHVlLnNjYWxhcjtcbiAgICAgICAgICAgIHJldHVybiBmaWVsZDtcbiAgICAgICAgfVxuICAgICAgICAvLyBsaXN0IGZpZWxkXG4gICAgICAgIGZpZWxkLmZpZWxkS2luZCA9IFwibGlzdFwiO1xuICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgVFlQRV9NRVNTQUdFOlxuICAgICAgICAgICAgY2FzZSBUWVBFX0dST1VQOlxuICAgICAgICAgICAgICAgIGZpZWxkLmxpc3RLaW5kID0gXCJtZXNzYWdlXCI7XG4gICAgICAgICAgICAgICAgZmllbGQubWVzc2FnZSA9IHJlZy5nZXRNZXNzYWdlKHRyaW1MZWFkaW5nRG90KHByb3RvLnR5cGVOYW1lKSk7XG4gICAgICAgICAgICAgICAgYXNzZXJ0KGZpZWxkLm1lc3NhZ2UpO1xuICAgICAgICAgICAgICAgIGZpZWxkLmRlbGltaXRlZEVuY29kaW5nID0gaXNEZWxpbWl0ZWRFbmNvZGluZyhwcm90bywgcGFyZW50T3JGaWxlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgVFlQRV9FTlVNOlxuICAgICAgICAgICAgICAgIGZpZWxkLmxpc3RLaW5kID0gXCJlbnVtXCI7XG4gICAgICAgICAgICAgICAgZmllbGQuZW51bSA9IHJlZy5nZXRFbnVtKHRyaW1MZWFkaW5nRG90KHByb3RvLnR5cGVOYW1lKSk7XG4gICAgICAgICAgICAgICAgYXNzZXJ0KGZpZWxkLmVudW0pO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICBmaWVsZC5saXN0S2luZCA9IFwic2NhbGFyXCI7XG4gICAgICAgICAgICAgICAgZmllbGQuc2NhbGFyID0gdHlwZTtcbiAgICAgICAgICAgICAgICBmaWVsZC5sb25nQXNTdHJpbmcgPSBqc3R5cGUgPT0gSlNfU1RSSU5HO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGZpZWxkLnBhY2tlZCA9IGlzUGFja2VkRmllbGQocHJvdG8sIHBhcmVudE9yRmlsZSk7XG4gICAgICAgIHJldHVybiBmaWVsZDtcbiAgICB9XG4gICAgLy8gc2luZ3VsYXJcbiAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgY2FzZSBUWVBFX01FU1NBR0U6XG4gICAgICAgIGNhc2UgVFlQRV9HUk9VUDpcbiAgICAgICAgICAgIGZpZWxkLmZpZWxkS2luZCA9IFwibWVzc2FnZVwiO1xuICAgICAgICAgICAgZmllbGQubWVzc2FnZSA9IHJlZy5nZXRNZXNzYWdlKHRyaW1MZWFkaW5nRG90KHByb3RvLnR5cGVOYW1lKSk7XG4gICAgICAgICAgICBhc3NlcnQoZmllbGQubWVzc2FnZSwgYGludmFsaWQgRmllbGREZXNjcmlwdG9yUHJvdG86IHR5cGVfbmFtZSAke3Byb3RvLnR5cGVOYW1lfSBub3QgZm91bmRgKTtcbiAgICAgICAgICAgIGZpZWxkLmRlbGltaXRlZEVuY29kaW5nID0gaXNEZWxpbWl0ZWRFbmNvZGluZyhwcm90bywgcGFyZW50T3JGaWxlKTtcbiAgICAgICAgICAgIGZpZWxkLmdldERlZmF1bHRWYWx1ZSA9ICgpID0+IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFRZUEVfRU5VTToge1xuICAgICAgICAgICAgY29uc3QgZW51bWVyYXRpb24gPSByZWcuZ2V0RW51bSh0cmltTGVhZGluZ0RvdChwcm90by50eXBlTmFtZSkpO1xuICAgICAgICAgICAgYXNzZXJ0KGVudW1lcmF0aW9uICE9PSB1bmRlZmluZWQsIGBpbnZhbGlkIEZpZWxkRGVzY3JpcHRvclByb3RvOiB0eXBlX25hbWUgJHtwcm90by50eXBlTmFtZX0gbm90IGZvdW5kYCk7XG4gICAgICAgICAgICBmaWVsZC5maWVsZEtpbmQgPSBcImVudW1cIjtcbiAgICAgICAgICAgIGZpZWxkLmVudW0gPSByZWcuZ2V0RW51bSh0cmltTGVhZGluZ0RvdChwcm90by50eXBlTmFtZSkpO1xuICAgICAgICAgICAgZmllbGQuZ2V0RGVmYXVsdFZhbHVlID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiB1bnNhZmVJc1NldEV4cGxpY2l0KHByb3RvLCBcImRlZmF1bHRWYWx1ZVwiKVxuICAgICAgICAgICAgICAgICAgICA/IHBhcnNlVGV4dEZvcm1hdEVudW1WYWx1ZShlbnVtZXJhdGlvbiwgcHJvdG8uZGVmYXVsdFZhbHVlKVxuICAgICAgICAgICAgICAgICAgICA6IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBkZWZhdWx0OiB7XG4gICAgICAgICAgICBmaWVsZC5maWVsZEtpbmQgPSBcInNjYWxhclwiO1xuICAgICAgICAgICAgZmllbGQuc2NhbGFyID0gdHlwZTtcbiAgICAgICAgICAgIGZpZWxkLmxvbmdBc1N0cmluZyA9IGpzdHlwZSA9PSBKU19TVFJJTkc7XG4gICAgICAgICAgICBmaWVsZC5nZXREZWZhdWx0VmFsdWUgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHVuc2FmZUlzU2V0RXhwbGljaXQocHJvdG8sIFwiZGVmYXVsdFZhbHVlXCIpXG4gICAgICAgICAgICAgICAgICAgID8gcGFyc2VUZXh0Rm9ybWF0U2NhbGFyVmFsdWUodHlwZSwgcHJvdG8uZGVmYXVsdFZhbHVlKVxuICAgICAgICAgICAgICAgICAgICA6IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmllbGQ7XG59XG4vKipcbiAqIFBhcnNlIHRoZSBcInN5bnRheFwiIGFuZCBcImVkaXRpb25cIiBmaWVsZHMsIHJldHVybmluZyBvbmUgb2YgdGhlIHN1cHBvcnRlZFxuICogZWRpdGlvbnMuXG4gKi9cbmZ1bmN0aW9uIGdldEZpbGVFZGl0aW9uKHByb3RvKSB7XG4gICAgc3dpdGNoIChwcm90by5zeW50YXgpIHtcbiAgICAgICAgY2FzZSBcIlwiOlxuICAgICAgICBjYXNlIFwicHJvdG8yXCI6XG4gICAgICAgICAgICByZXR1cm4gRURJVElPTl9QUk9UTzI7XG4gICAgICAgIGNhc2UgXCJwcm90bzNcIjpcbiAgICAgICAgICAgIHJldHVybiBFRElUSU9OX1BST1RPMztcbiAgICAgICAgY2FzZSBcImVkaXRpb25zXCI6XG4gICAgICAgICAgICBpZiAocHJvdG8uZWRpdGlvbiBpbiBmZWF0dXJlRGVmYXVsdHMpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcHJvdG8uZWRpdGlvbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgJHtwcm90by5uYW1lfTogdW5zdXBwb3J0ZWQgZWRpdGlvbmApO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3Byb3RvLm5hbWV9OiB1bnN1cHBvcnRlZCBzeW50YXggXCIke3Byb3RvLnN5bnRheH1cImApO1xuICAgIH1cbn1cbi8qKlxuICogUmVzb2x2ZSBkZXBlbmRlbmNpZXMgb2YgRmlsZURlc2NyaXB0b3JQcm90byB0byBEZXNjRmlsZS5cbiAqL1xuZnVuY3Rpb24gZmluZEZpbGVEZXBlbmRlbmNpZXMocHJvdG8sIHJlZykge1xuICAgIHJldHVybiBwcm90by5kZXBlbmRlbmN5Lm1hcCgod2FudE5hbWUpID0+IHtcbiAgICAgICAgY29uc3QgZGVwID0gcmVnLmdldEZpbGUod2FudE5hbWUpO1xuICAgICAgICBpZiAoIWRlcCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgZmluZCAke3dhbnROYW1lfSwgaW1wb3J0ZWQgYnkgJHtwcm90by5uYW1lfWApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkZXA7XG4gICAgfSk7XG59XG4vKipcbiAqIEZpbmRzIGEgcHJlZml4IHNoYXJlZCBieSBlbnVtIHZhbHVlcywgZm9yIGV4YW1wbGUgYG15X2VudW1fYCBmb3JcbiAqIGBlbnVtIE15RW51bSB7TVlfRU5VTV9BPTA7IE1ZX0VOVU1fQj0xO31gLlxuICovXG5mdW5jdGlvbiBmaW5kRW51bVNoYXJlZFByZWZpeChlbnVtTmFtZSwgdmFsdWVzKSB7XG4gICAgY29uc3QgcHJlZml4ID0gY2FtZWxUb1NuYWtlQ2FzZShlbnVtTmFtZSkgKyBcIl9cIjtcbiAgICBmb3IgKGNvbnN0IHZhbHVlIG9mIHZhbHVlcykge1xuICAgICAgICBpZiAoIXZhbHVlLm5hbWUudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKHByZWZpeCkpIHtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc2hvcnROYW1lID0gdmFsdWUubmFtZS5zdWJzdHJpbmcocHJlZml4Lmxlbmd0aCk7XG4gICAgICAgIGlmIChzaG9ydE5hbWUubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKC9eXFxkLy50ZXN0KHNob3J0TmFtZSkpIHtcbiAgICAgICAgICAgIC8vIGlkZW50aWZpZXJzIG11c3Qgbm90IHN0YXJ0IHdpdGggbnVtYmVyc1xuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcHJlZml4O1xufVxuLyoqXG4gKiBDb252ZXJ0cyBsb3dlckNhbWVsQ2FzZSBvciBVcHBlckNhbWVsQ2FzZSBpbnRvIGxvd2VyX3NuYWtlX2Nhc2UuXG4gKiBUaGlzIGlzIHVzZWQgdG8gZmluZCBzaGFyZWQgcHJlZml4ZXMgaW4gYW4gZW51bS5cbiAqL1xuZnVuY3Rpb24gY2FtZWxUb1NuYWtlQ2FzZShjYW1lbCkge1xuICAgIHJldHVybiAoY2FtZWwuc3Vic3RyaW5nKDAsIDEpICsgY2FtZWwuc3Vic3RyaW5nKDEpLnJlcGxhY2UoL1tBLVpdL2csIChjKSA9PiBcIl9cIiArIGMpKS50b0xvd2VyQ2FzZSgpO1xufVxuLyoqXG4gKiBDcmVhdGUgYSBmdWxseSBxdWFsaWZpZWQgbmFtZSBmb3IgYSBwcm90b2J1ZiB0eXBlIG9yIGV4dGVuc2lvbiBmaWVsZC5cbiAqXG4gKiBUaGUgZnVsbHkgcXVhbGlmaWVkIG5hbWUgZm9yIG1lc3NhZ2VzLCBlbnVtZXJhdGlvbnMsIGFuZCBzZXJ2aWNlcyBpc1xuICogY29uc3RydWN0ZWQgYnkgY29uY2F0ZW5hdGluZyB0aGUgcGFja2FnZSBuYW1lIChpZiBwcmVzZW50KSwgcGFyZW50XG4gKiBtZXNzYWdlIG5hbWVzIChmb3IgbmVzdGVkIHR5cGVzKSwgYW5kIHRoZSB0eXBlIG5hbWUuIFdlIG9taXQgdGhlIGxlYWRpbmdcbiAqIGRvdCBhZGRlZCBieSBwcm90b2J1ZiBjb21waWxlcnMuIEV4YW1wbGVzOlxuICogLSBteXBhY2thZ2UuTXlNZXNzYWdlXG4gKiAtIG15cGFja2FnZS5NeU1lc3NhZ2UuTmVzdGVkTWVzc2FnZVxuICpcbiAqIFRoZSBmdWxseSBxdWFsaWZpZWQgbmFtZSBmb3IgZXh0ZW5zaW9uIGZpZWxkcyBpcyBjb25zdHJ1Y3RlZCBieVxuICogY29uY2F0ZW5hdGluZyB0aGUgcGFja2FnZSBuYW1lIChpZiBwcmVzZW50KSwgcGFyZW50IG1lc3NhZ2UgbmFtZXMgKGZvclxuICogZXh0ZW5zaW9ucyBkZWNsYXJlZCB3aXRoaW4gYSBtZXNzYWdlKSwgYW5kIHRoZSBmaWVsZCBuYW1lLiBFeGFtcGxlczpcbiAqIC0gbXlwYWNrYWdlLmV4dGZpZWxkXG4gKiAtIG15cGFja2FnZS5NeU1lc3NhZ2UuZXh0ZmllbGRcbiAqL1xuZnVuY3Rpb24gbWFrZVR5cGVOYW1lKHByb3RvLCBwYXJlbnQsIGZpbGUpIHtcbiAgICBsZXQgdHlwZU5hbWU7XG4gICAgaWYgKHBhcmVudCkge1xuICAgICAgICB0eXBlTmFtZSA9IGAke3BhcmVudC50eXBlTmFtZX0uJHtwcm90by5uYW1lfWA7XG4gICAgfVxuICAgIGVsc2UgaWYgKGZpbGUucHJvdG8ucGFja2FnZS5sZW5ndGggPiAwKSB7XG4gICAgICAgIHR5cGVOYW1lID0gYCR7ZmlsZS5wcm90by5wYWNrYWdlfS4ke3Byb3RvLm5hbWV9YDtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHR5cGVOYW1lID0gYCR7cHJvdG8ubmFtZX1gO1xuICAgIH1cbiAgICByZXR1cm4gdHlwZU5hbWU7XG59XG4vKipcbiAqIFJlbW92ZSB0aGUgbGVhZGluZyBkb3QgZnJvbSBhIGZ1bGx5IHF1YWxpZmllZCB0eXBlIG5hbWUuXG4gKi9cbmZ1bmN0aW9uIHRyaW1MZWFkaW5nRG90KHR5cGVOYW1lKSB7XG4gICAgcmV0dXJuIHR5cGVOYW1lLnN0YXJ0c1dpdGgoXCIuXCIpID8gdHlwZU5hbWUuc3Vic3RyaW5nKDEpIDogdHlwZU5hbWU7XG59XG4vKipcbiAqIERpZCB0aGUgdXNlciBwdXQgdGhlIGZpZWxkIGluIGEgb25lb2YgZ3JvdXA/XG4gKiBTeW50aGV0aWMgb25lb2ZzIGZvciBwcm90bzMgb3B0aW9uYWxzIGFyZSBpZ25vcmVkLlxuICovXG5mdW5jdGlvbiBmaW5kT25lb2YocHJvdG8sIGFsbE9uZW9mcykge1xuICAgIGlmICghdW5zYWZlSXNTZXRFeHBsaWNpdChwcm90bywgXCJvbmVvZkluZGV4XCIpKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGlmIChwcm90by5wcm90bzNPcHRpb25hbCkge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICBjb25zdCBvbmVvZiA9IGFsbE9uZW9mc1twcm90by5vbmVvZkluZGV4XTtcbiAgICBhc3NlcnQob25lb2YsIGBpbnZhbGlkIEZpZWxkRGVzY3JpcHRvclByb3RvOiBvbmVvZiAjJHtwcm90by5vbmVvZkluZGV4fSBmb3IgZmllbGQgIyR7cHJvdG8ubnVtYmVyfSBub3QgZm91bmRgKTtcbiAgICByZXR1cm4gb25lb2Y7XG59XG4vKipcbiAqIFByZXNlbmNlIG9mIHRoZSBmaWVsZC5cbiAqIFNlZSBodHRwczovL3Byb3RvYnVmLmRldi9wcm9ncmFtbWluZy1ndWlkZXMvZmllbGRfcHJlc2VuY2UvXG4gKi9cbmZ1bmN0aW9uIGdldEZpZWxkUHJlc2VuY2UocHJvdG8sIG9uZW9mLCBpc0V4dGVuc2lvbiwgcGFyZW50KSB7XG4gICAgaWYgKHByb3RvLmxhYmVsID09IExBQkVMX1JFUVVJUkVEKSB7XG4gICAgICAgIC8vIHByb3RvMiByZXF1aXJlZCBpcyBMRUdBQ1lfUkVRVUlSRURcbiAgICAgICAgcmV0dXJuIExFR0FDWV9SRVFVSVJFRDtcbiAgICB9XG4gICAgaWYgKHByb3RvLmxhYmVsID09IExBQkVMX1JFUEVBVEVEKSB7XG4gICAgICAgIC8vIHJlcGVhdGVkIGZpZWxkcyAoaW5jbHVkaW5nIG1hcHMpIGRvIG5vdCB0cmFjayBwcmVzZW5jZVxuICAgICAgICByZXR1cm4gSU1QTElDSVQ7XG4gICAgfVxuICAgIGlmICghIW9uZW9mIHx8IHByb3RvLnByb3RvM09wdGlvbmFsKSB7XG4gICAgICAgIC8vIG9uZW9mIGlzIGFsd2F5cyBleHBsaWNpdFxuICAgICAgICByZXR1cm4gRVhQTElDSVQ7XG4gICAgfVxuICAgIGlmIChpc0V4dGVuc2lvbikge1xuICAgICAgICAvLyBleHRlbnNpb25zIGFsd2F5cyB0cmFjayBwcmVzZW5jZVxuICAgICAgICByZXR1cm4gRVhQTElDSVQ7XG4gICAgfVxuICAgIGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZUZlYXR1cmUoXCJmaWVsZFByZXNlbmNlXCIsIHsgcHJvdG8sIHBhcmVudCB9KTtcbiAgICBpZiAocmVzb2x2ZWQgPT0gSU1QTElDSVQgJiZcbiAgICAgICAgKHByb3RvLnR5cGUgPT0gVFlQRV9NRVNTQUdFIHx8IHByb3RvLnR5cGUgPT0gVFlQRV9HUk9VUCkpIHtcbiAgICAgICAgLy8gc2luZ3VsYXIgbWVzc2FnZSBmaWVsZCBjYW5ub3QgYmUgaW1wbGljaXRcbiAgICAgICAgcmV0dXJuIEVYUExJQ0lUO1xuICAgIH1cbiAgICByZXR1cm4gcmVzb2x2ZWQ7XG59XG4vKipcbiAqIFBhY2sgdGhpcyByZXBlYXRlZCBmaWVsZD9cbiAqL1xuZnVuY3Rpb24gaXNQYWNrZWRGaWVsZChwcm90bywgcGFyZW50KSB7XG4gICAgaWYgKHByb3RvLmxhYmVsICE9IExBQkVMX1JFUEVBVEVEKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgc3dpdGNoIChwcm90by50eXBlKSB7XG4gICAgICAgIGNhc2UgVFlQRV9TVFJJTkc6XG4gICAgICAgIGNhc2UgVFlQRV9CWVRFUzpcbiAgICAgICAgY2FzZSBUWVBFX0dST1VQOlxuICAgICAgICBjYXNlIFRZUEVfTUVTU0FHRTpcbiAgICAgICAgICAgIC8vIGxlbmd0aC1kZWxpbWl0ZWQgdHlwZXMgY2Fubm90IGJlIHBhY2tlZFxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBjb25zdCBvID0gcHJvdG8ub3B0aW9ucztcbiAgICBpZiAobyAmJiB1bnNhZmVJc1NldEV4cGxpY2l0KG8sIFwicGFja2VkXCIpKSB7XG4gICAgICAgIC8vIHByZWZlciB0aGUgZmllbGQgb3B0aW9uIG92ZXIgZWRpdGlvbiBmZWF0dXJlc1xuICAgICAgICByZXR1cm4gby5wYWNrZWQ7XG4gICAgfVxuICAgIHJldHVybiAoUEFDS0VEID09XG4gICAgICAgIHJlc29sdmVGZWF0dXJlKFwicmVwZWF0ZWRGaWVsZEVuY29kaW5nXCIsIHtcbiAgICAgICAgICAgIHByb3RvLFxuICAgICAgICAgICAgcGFyZW50LFxuICAgICAgICB9KSk7XG59XG4vKipcbiAqIEZpbmQgdGhlIGtleSBhbmQgdmFsdWUgZmllbGRzIG9mIGEgc3ludGhldGljIG1hcCBlbnRyeSBtZXNzYWdlLlxuICovXG5mdW5jdGlvbiBmaW5kTWFwRW50cnlGaWVsZHMobWFwRW50cnkpIHtcbiAgICBjb25zdCBrZXkgPSBtYXBFbnRyeS5maWVsZHMuZmluZCgoZikgPT4gZi5udW1iZXIgPT09IDEpO1xuICAgIGNvbnN0IHZhbHVlID0gbWFwRW50cnkuZmllbGRzLmZpbmQoKGYpID0+IGYubnVtYmVyID09PSAyKTtcbiAgICBhc3NlcnQoa2V5ICYmXG4gICAgICAgIGtleS5maWVsZEtpbmQgPT0gXCJzY2FsYXJcIiAmJlxuICAgICAgICBrZXkuc2NhbGFyICE9IFNjYWxhclR5cGUuQllURVMgJiZcbiAgICAgICAga2V5LnNjYWxhciAhPSBTY2FsYXJUeXBlLkZMT0FUICYmXG4gICAgICAgIGtleS5zY2FsYXIgIT0gU2NhbGFyVHlwZS5ET1VCTEUgJiZcbiAgICAgICAgdmFsdWUgJiZcbiAgICAgICAgdmFsdWUuZmllbGRLaW5kICE9IFwibGlzdFwiICYmXG4gICAgICAgIHZhbHVlLmZpZWxkS2luZCAhPSBcIm1hcFwiKTtcbiAgICByZXR1cm4geyBrZXksIHZhbHVlIH07XG59XG4vKipcbiAqIEVudW1lcmF0aW9ucyBjYW4gYmUgb3BlbiBvciBjbG9zZWQuXG4gKiBTZWUgaHR0cHM6Ly9wcm90b2J1Zi5kZXYvcHJvZ3JhbW1pbmctZ3VpZGVzL2VudW0vXG4gKi9cbmZ1bmN0aW9uIGlzRW51bU9wZW4oZGVzYykge1xuICAgIHZhciBfYTtcbiAgICByZXR1cm4gKE9QRU4gPT1cbiAgICAgICAgcmVzb2x2ZUZlYXR1cmUoXCJlbnVtVHlwZVwiLCB7XG4gICAgICAgICAgICBwcm90bzogZGVzYy5wcm90byxcbiAgICAgICAgICAgIHBhcmVudDogKF9hID0gZGVzYy5wYXJlbnQpICE9PSBudWxsICYmIF9hICE9PSB2b2lkIDAgPyBfYSA6IGRlc2MuZmlsZSxcbiAgICAgICAgfSkpO1xufVxuLyoqXG4gKiBFbmNvZGUgdGhlIG1lc3NhZ2UgZGVsaW1pdGVkIChhLmsuYS4gcHJvdG8yIGdyb3VwIGVuY29kaW5nKSwgb3JcbiAqIGxlbmd0aC1wcmVmaXhlZD9cbiAqL1xuZnVuY3Rpb24gaXNEZWxpbWl0ZWRFbmNvZGluZyhwcm90bywgcGFyZW50KSB7XG4gICAgaWYgKHByb3RvLnR5cGUgPT0gVFlQRV9HUk9VUCkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIChERUxJTUlURUQgPT1cbiAgICAgICAgcmVzb2x2ZUZlYXR1cmUoXCJtZXNzYWdlRW5jb2RpbmdcIiwge1xuICAgICAgICAgICAgcHJvdG8sXG4gICAgICAgICAgICBwYXJlbnQsXG4gICAgICAgIH0pKTtcbn1cbmZ1bmN0aW9uIHJlc29sdmVGZWF0dXJlKG5hbWUsIHJlZikge1xuICAgIHZhciBfYSwgX2I7XG4gICAgY29uc3QgZmVhdHVyZVNldCA9IChfYSA9IHJlZi5wcm90by5vcHRpb25zKSA9PT0gbnVsbCB8fCBfYSA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2EuZmVhdHVyZXM7XG4gICAgaWYgKGZlYXR1cmVTZXQpIHtcbiAgICAgICAgY29uc3QgdmFsID0gZmVhdHVyZVNldFtuYW1lXTtcbiAgICAgICAgaWYgKHZhbCAhPSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gdmFsO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChcImtpbmRcIiBpbiByZWYpIHtcbiAgICAgICAgaWYgKHJlZi5raW5kID09IFwibWVzc2FnZVwiKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzb2x2ZUZlYXR1cmUobmFtZSwgKF9iID0gcmVmLnBhcmVudCkgIT09IG51bGwgJiYgX2IgIT09IHZvaWQgMCA/IF9iIDogcmVmLmZpbGUpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGVkaXRpb25EZWZhdWx0cyA9IGZlYXR1cmVEZWZhdWx0c1tyZWYuZWRpdGlvbl07XG4gICAgICAgIGlmICghZWRpdGlvbkRlZmF1bHRzKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGZlYXR1cmUgZGVmYXVsdCBmb3IgZWRpdGlvbiAke3JlZi5lZGl0aW9ufSBub3QgZm91bmRgKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZWRpdGlvbkRlZmF1bHRzW25hbWVdO1xuICAgIH1cbiAgICByZXR1cm4gcmVzb2x2ZUZlYXR1cmUobmFtZSwgcmVmLnBhcmVudCk7XG59XG4vKipcbiAqIEFzc2VydCB0aGF0IGNvbmRpdGlvbiBpcyB0cnV0aHkgb3IgdGhyb3cgZXJyb3IgKHdpdGggbWVzc2FnZSlcbiAqL1xuZnVuY3Rpb24gYXNzZXJ0KGNvbmRpdGlvbiwgbXNnKSB7XG4gICAgaWYgKCFjb25kaXRpb24pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1zZyk7XG4gICAgfVxufVxuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5pbXBvcnQgeyByZXN0b3JlSnNvbk5hbWVzIH0gZnJvbSBcIi4vcmVzdG9yZS1qc29uLW5hbWVzLmpzXCI7XG5pbXBvcnQgeyBjcmVhdGVGaWxlUmVnaXN0cnkgfSBmcm9tIFwiLi4vcmVnaXN0cnkuanNcIjtcbi8qKlxuICogSHlkcmF0ZSBhIGZpbGUgZGVzY3JpcHRvciBmb3IgZ29vZ2xlL3Byb3RvYnVmL2Rlc2NyaXB0b3IucHJvdG8gZnJvbSBhIHBsYWluXG4gKiBvYmplY3QuXG4gKlxuICogU2VlIGNyZWF0ZUZpbGVEZXNjcmlwdG9yUHJvdG9Cb290KCkgZm9yIGRldGFpbHMuXG4gKlxuICogQHByaXZhdGVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJvb3QoYm9vdCkge1xuICAgIGNvbnN0IHJvb3QgPSBib290RmlsZURlc2NyaXB0b3JQcm90byhib290KTtcbiAgICByb290Lm1lc3NhZ2VUeXBlLmZvckVhY2gocmVzdG9yZUpzb25OYW1lcyk7XG4gICAgY29uc3QgcmVnID0gY3JlYXRlRmlsZVJlZ2lzdHJ5KHJvb3QsICgpID0+IHVuZGVmaW5lZCk7XG4gICAgLy8gYmlvbWUtaWdub3JlIGxpbnQvc3R5bGUvbm9Ob25OdWxsQXNzZXJ0aW9uOiBub24tbnVsbCBhc3NlcnRpb24gYmVjYXVzZSB3ZSBqdXN0IGNyZWF0ZWQgdGhlIHJlZ2lzdHJ5IGZyb20gdGhlIGZpbGUgd2UgbG9vayB1cFxuICAgIHJldHVybiByZWcuZ2V0RmlsZShyb290Lm5hbWUpO1xufVxuLyoqXG4gKiBDcmVhdGVzIHRoZSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5GaWxlRGVzY3JpcHRvclByb3RvIGZyb20gYW4gb2JqZWN0IGxpdGVyYWwuXG4gKlxuICogU2VlIGNyZWF0ZUZpbGVEZXNjcmlwdG9yUHJvdG9Cb290KCkgZm9yIGRldGFpbHMuXG4gKlxuICogQHByaXZhdGVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJvb3RGaWxlRGVzY3JpcHRvclByb3RvKGluaXQpIHtcbiAgICBjb25zdCBwcm90byA9IE9iamVjdC5jcmVhdGUoe1xuICAgICAgICBzeW50YXg6IFwiXCIsXG4gICAgICAgIGVkaXRpb246IDAsXG4gICAgfSk7XG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24ocHJvdG8sIE9iamVjdC5hc3NpZ24oT2JqZWN0LmFzc2lnbih7ICR0eXBlTmFtZTogXCJnb29nbGUucHJvdG9idWYuRmlsZURlc2NyaXB0b3JQcm90b1wiLCBkZXBlbmRlbmN5OiBbXSwgcHVibGljRGVwZW5kZW5jeTogW10sIHdlYWtEZXBlbmRlbmN5OiBbXSwgb3B0aW9uRGVwZW5kZW5jeTogW10sIHNlcnZpY2U6IFtdLCBleHRlbnNpb246IFtdIH0sIGluaXQpLCB7IG1lc3NhZ2VUeXBlOiBpbml0Lm1lc3NhZ2VUeXBlLm1hcChib290RGVzY3JpcHRvclByb3RvKSwgZW51bVR5cGU6IGluaXQuZW51bVR5cGUubWFwKGJvb3RFbnVtRGVzY3JpcHRvclByb3RvKSB9KSk7XG59XG5mdW5jdGlvbiBib290RGVzY3JpcHRvclByb3RvKGluaXQpIHtcbiAgICB2YXIgX2EsIF9iLCBfYywgX2QsIF9lLCBfZiwgX2csIF9oO1xuICAgIGNvbnN0IHByb3RvID0gT2JqZWN0LmNyZWF0ZSh7XG4gICAgICAgIHZpc2liaWxpdHk6IDAsXG4gICAgfSk7XG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24ocHJvdG8sIHtcbiAgICAgICAgJHR5cGVOYW1lOiBcImdvb2dsZS5wcm90b2J1Zi5EZXNjcmlwdG9yUHJvdG9cIixcbiAgICAgICAgbmFtZTogaW5pdC5uYW1lLFxuICAgICAgICBmaWVsZDogKF9iID0gKF9hID0gaW5pdC5maWVsZCkgPT09IG51bGwgfHwgX2EgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9hLm1hcChib290RmllbGREZXNjcmlwdG9yUHJvdG8pKSAhPT0gbnVsbCAmJiBfYiAhPT0gdm9pZCAwID8gX2IgOiBbXSxcbiAgICAgICAgZXh0ZW5zaW9uOiBbXSxcbiAgICAgICAgbmVzdGVkVHlwZTogKF9kID0gKF9jID0gaW5pdC5uZXN0ZWRUeXBlKSA9PT0gbnVsbCB8fCBfYyA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2MubWFwKGJvb3REZXNjcmlwdG9yUHJvdG8pKSAhPT0gbnVsbCAmJiBfZCAhPT0gdm9pZCAwID8gX2QgOiBbXSxcbiAgICAgICAgZW51bVR5cGU6IChfZiA9IChfZSA9IGluaXQuZW51bVR5cGUpID09PSBudWxsIHx8IF9lID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfZS5tYXAoYm9vdEVudW1EZXNjcmlwdG9yUHJvdG8pKSAhPT0gbnVsbCAmJiBfZiAhPT0gdm9pZCAwID8gX2YgOiBbXSxcbiAgICAgICAgZXh0ZW5zaW9uUmFuZ2U6IChfaCA9IChfZyA9IGluaXQuZXh0ZW5zaW9uUmFuZ2UpID09PSBudWxsIHx8IF9nID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfZy5tYXAoKGUpID0+IChPYmplY3QuYXNzaWduKHsgJHR5cGVOYW1lOiBcImdvb2dsZS5wcm90b2J1Zi5EZXNjcmlwdG9yUHJvdG8uRXh0ZW5zaW9uUmFuZ2VcIiB9LCBlKSkpKSAhPT0gbnVsbCAmJiBfaCAhPT0gdm9pZCAwID8gX2ggOiBbXSxcbiAgICAgICAgb25lb2ZEZWNsOiBbXSxcbiAgICAgICAgcmVzZXJ2ZWRSYW5nZTogW10sXG4gICAgICAgIHJlc2VydmVkTmFtZTogW10sXG4gICAgfSk7XG59XG5mdW5jdGlvbiBib290RmllbGREZXNjcmlwdG9yUHJvdG8oaW5pdCkge1xuICAgIGNvbnN0IHByb3RvID0gT2JqZWN0LmNyZWF0ZSh7XG4gICAgICAgIGxhYmVsOiAxLFxuICAgICAgICB0eXBlTmFtZTogXCJcIixcbiAgICAgICAgZXh0ZW5kZWU6IFwiXCIsXG4gICAgICAgIGRlZmF1bHRWYWx1ZTogXCJcIixcbiAgICAgICAgb25lb2ZJbmRleDogMCxcbiAgICAgICAganNvbk5hbWU6IFwiXCIsXG4gICAgICAgIHByb3RvM09wdGlvbmFsOiBmYWxzZSxcbiAgICB9KTtcbiAgICByZXR1cm4gT2JqZWN0LmFzc2lnbihwcm90bywgT2JqZWN0LmFzc2lnbihPYmplY3QuYXNzaWduKHsgJHR5cGVOYW1lOiBcImdvb2dsZS5wcm90b2J1Zi5GaWVsZERlc2NyaXB0b3JQcm90b1wiIH0sIGluaXQpLCB7IG9wdGlvbnM6IGluaXQub3B0aW9ucyA/IGJvb3RGaWVsZE9wdGlvbnMoaW5pdC5vcHRpb25zKSA6IHVuZGVmaW5lZCB9KSk7XG59XG5mdW5jdGlvbiBib290RmllbGRPcHRpb25zKGluaXQpIHtcbiAgICB2YXIgX2EsIF9iLCBfYztcbiAgICBjb25zdCBwcm90byA9IE9iamVjdC5jcmVhdGUoe1xuICAgICAgICBjdHlwZTogMCxcbiAgICAgICAgcGFja2VkOiBmYWxzZSxcbiAgICAgICAganN0eXBlOiAwLFxuICAgICAgICBsYXp5OiBmYWxzZSxcbiAgICAgICAgdW52ZXJpZmllZExhenk6IGZhbHNlLFxuICAgICAgICBkZXByZWNhdGVkOiBmYWxzZSxcbiAgICAgICAgd2VhazogZmFsc2UsXG4gICAgICAgIGRlYnVnUmVkYWN0OiBmYWxzZSxcbiAgICAgICAgcmV0ZW50aW9uOiAwLFxuICAgIH0pO1xuICAgIHJldHVybiBPYmplY3QuYXNzaWduKHByb3RvLCBPYmplY3QuYXNzaWduKE9iamVjdC5hc3NpZ24oeyAkdHlwZU5hbWU6IFwiZ29vZ2xlLnByb3RvYnVmLkZpZWxkT3B0aW9uc1wiIH0sIGluaXQpLCB7IHRhcmdldHM6IChfYSA9IGluaXQudGFyZ2V0cykgIT09IG51bGwgJiYgX2EgIT09IHZvaWQgMCA/IF9hIDogW10sIGVkaXRpb25EZWZhdWx0czogKF9jID0gKF9iID0gaW5pdC5lZGl0aW9uRGVmYXVsdHMpID09PSBudWxsIHx8IF9iID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfYi5tYXAoKGUpID0+IChPYmplY3QuYXNzaWduKHsgJHR5cGVOYW1lOiBcImdvb2dsZS5wcm90b2J1Zi5GaWVsZE9wdGlvbnMuRWRpdGlvbkRlZmF1bHRcIiB9LCBlKSkpKSAhPT0gbnVsbCAmJiBfYyAhPT0gdm9pZCAwID8gX2MgOiBbXSwgdW5pbnRlcnByZXRlZE9wdGlvbjogW10gfSkpO1xufVxuZnVuY3Rpb24gYm9vdEVudW1EZXNjcmlwdG9yUHJvdG8oaW5pdCkge1xuICAgIGNvbnN0IHByb3RvID0gT2JqZWN0LmNyZWF0ZSh7XG4gICAgICAgIHZpc2liaWxpdHk6IDAsXG4gICAgfSk7XG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24ocHJvdG8sIHtcbiAgICAgICAgJHR5cGVOYW1lOiBcImdvb2dsZS5wcm90b2J1Zi5FbnVtRGVzY3JpcHRvclByb3RvXCIsXG4gICAgICAgIG5hbWU6IGluaXQubmFtZSxcbiAgICAgICAgcmVzZXJ2ZWROYW1lOiBbXSxcbiAgICAgICAgcmVzZXJ2ZWRSYW5nZTogW10sXG4gICAgICAgIHZhbHVlOiBpbml0LnZhbHVlLm1hcCgoZSkgPT4gKE9iamVjdC5hc3NpZ24oeyAkdHlwZU5hbWU6IFwiZ29vZ2xlLnByb3RvYnVmLkVudW1WYWx1ZURlc2NyaXB0b3JQcm90b1wiIH0sIGUpKSksXG4gICAgfSk7XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbmltcG9ydCB7IHVuc2FmZUNsZWFyLCB1bnNhZmVJc1NldCB9IGZyb20gXCIuL3JlZmxlY3QvdW5zYWZlLmpzXCI7XG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgZmllbGQgaXMgc2V0LlxuICpcbiAqIC0gU2NhbGFyIGFuZCBlbnVtIGZpZWxkcyB3aXRoIGltcGxpY2l0IHByZXNlbmNlIChwcm90bzMpOlxuICogICBTZXQgaWYgbm90IGEgemVybyB2YWx1ZS5cbiAqXG4gKiAtIFNjYWxhciBhbmQgZW51bSBmaWVsZHMgd2l0aCBleHBsaWNpdCBwcmVzZW5jZSAocHJvdG8yLCBvbmVvZik6XG4gKiAgIFNldCBpZiBhIHZhbHVlIHdhcyBzZXQgd2hlbiBjcmVhdGluZyBvciBwYXJzaW5nIHRoZSBtZXNzYWdlLCBvciB3aGVuIGFcbiAqICAgdmFsdWUgd2FzIGFzc2lnbmVkIHRvIHRoZSBmaWVsZCdzIHByb3BlcnR5LlxuICpcbiAqIC0gTWVzc2FnZSBmaWVsZHM6XG4gKiAgIFNldCBpZiB0aGUgcHJvcGVydHkgaXMgbm90IHVuZGVmaW5lZC5cbiAqXG4gKiAtIExpc3QgYW5kIG1hcCBmaWVsZHM6XG4gKiAgIFNldCBpZiBub3QgZW1wdHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0ZpZWxkU2V0KG1lc3NhZ2UsIGZpZWxkKSB7XG4gICAgcmV0dXJuIChmaWVsZC5wYXJlbnQudHlwZU5hbWUgPT0gbWVzc2FnZS4kdHlwZU5hbWUgJiYgdW5zYWZlSXNTZXQobWVzc2FnZSwgZmllbGQpKTtcbn1cbi8qKlxuICogUmVzZXRzIHRoZSBmaWVsZCwgc28gdGhhdCBpc0ZpZWxkU2V0KCkgd2lsbCByZXR1cm4gZmFsc2UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjbGVhckZpZWxkKG1lc3NhZ2UsIGZpZWxkKSB7XG4gICAgaWYgKGZpZWxkLnBhcmVudC50eXBlTmFtZSA9PSBtZXNzYWdlLiR0eXBlTmFtZSkge1xuICAgICAgICB1bnNhZmVDbGVhcihtZXNzYWdlLCBmaWVsZCk7XG4gICAgfVxufVxuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4vKipcbiAqIERlY29kZXMgYSBiYXNlNjQgc3RyaW5nIHRvIGEgYnl0ZSBhcnJheS5cbiAqXG4gKiAtIGlnbm9yZXMgd2hpdGUtc3BhY2UsIGluY2x1ZGluZyBsaW5lIGJyZWFrcyBhbmQgdGFic1xuICogLSBhbGxvd3MgaW5uZXIgcGFkZGluZyAoY2FuIGRlY29kZSBjb25jYXRlbmF0ZWQgYmFzZTY0IHN0cmluZ3MpXG4gKiAtIGRvZXMgbm90IHJlcXVpcmUgcGFkZGluZ1xuICogLSB1bmRlcnN0YW5kcyBiYXNlNjR1cmwgZW5jb2Rpbmc6XG4gKiAgIFwiLVwiIGluc3RlYWQgb2YgXCIrXCIsXG4gKiAgIFwiX1wiIGluc3RlYWQgb2YgXCIvXCIsXG4gKiAgIG5vIHBhZGRpbmdcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJhc2U2NERlY29kZShiYXNlNjRTdHIpIHtcbiAgICBjb25zdCB0YWJsZSA9IGdldERlY29kZVRhYmxlKCk7XG4gICAgLy8gZXN0aW1hdGUgYnl0ZSBzaXplLCBub3QgYWNjb3VudGluZyBmb3IgaW5uZXIgcGFkZGluZyBhbmQgd2hpdGVzcGFjZVxuICAgIGxldCBlcyA9IChiYXNlNjRTdHIubGVuZ3RoICogMykgLyA0O1xuICAgIGlmIChiYXNlNjRTdHJbYmFzZTY0U3RyLmxlbmd0aCAtIDJdID09IFwiPVwiKVxuICAgICAgICBlcyAtPSAyO1xuICAgIGVsc2UgaWYgKGJhc2U2NFN0cltiYXNlNjRTdHIubGVuZ3RoIC0gMV0gPT0gXCI9XCIpXG4gICAgICAgIGVzIC09IDE7XG4gICAgbGV0IGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoZXMpLCBieXRlUG9zID0gMCwgLy8gcG9zaXRpb24gaW4gYnl0ZSBhcnJheVxuICAgIGdyb3VwUG9zID0gMCwgLy8gcG9zaXRpb24gaW4gYmFzZTY0IGdyb3VwXG4gICAgYiwgLy8gY3VycmVudCBieXRlXG4gICAgcCA9IDA7IC8vIHByZXZpb3VzIGJ5dGVcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGJhc2U2NFN0ci5sZW5ndGg7IGkrKykge1xuICAgICAgICBiID0gdGFibGVbYmFzZTY0U3RyLmNoYXJDb2RlQXQoaSldO1xuICAgICAgICBpZiAoYiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBzd2l0Y2ggKGJhc2U2NFN0cltpXSkge1xuICAgICAgICAgICAgICAgIC8vIEB0cy1pZ25vcmUgVFM3MDI5OiBGYWxsdGhyb3VnaCBjYXNlIGluIHN3aXRjaCAtLSBpZ25vcmUgaW5zdGVhZCBvZiBleHBlY3QtZXJyb3IgZm9yIGNvbXBpbGVyIHNldHRpbmdzIHdpdGhvdXQgbm9GYWxsdGhyb3VnaENhc2VzSW5Td2l0Y2g6IHRydWVcbiAgICAgICAgICAgICAgICBjYXNlIFwiPVwiOlxuICAgICAgICAgICAgICAgICAgICBncm91cFBvcyA9IDA7IC8vIHJlc2V0IHN0YXRlIHdoZW4gcGFkZGluZyBmb3VuZFxuICAgICAgICAgICAgICAgIGNhc2UgXCJcXG5cIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwiXFxyXCI6XG4gICAgICAgICAgICAgICAgY2FzZSBcIlxcdFwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCIgXCI6XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlOyAvLyBza2lwIHdoaXRlLXNwYWNlLCBhbmQgcGFkZGluZ1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIHRocm93IEVycm9yKFwiaW52YWxpZCBiYXNlNjQgc3RyaW5nXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHN3aXRjaCAoZ3JvdXBQb3MpIHtcbiAgICAgICAgICAgIGNhc2UgMDpcbiAgICAgICAgICAgICAgICBwID0gYjtcbiAgICAgICAgICAgICAgICBncm91cFBvcyA9IDE7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDE6XG4gICAgICAgICAgICAgICAgYnl0ZXNbYnl0ZVBvcysrXSA9IChwIDw8IDIpIHwgKChiICYgNDgpID4+IDQpO1xuICAgICAgICAgICAgICAgIHAgPSBiO1xuICAgICAgICAgICAgICAgIGdyb3VwUG9zID0gMjtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgMjpcbiAgICAgICAgICAgICAgICBieXRlc1tieXRlUG9zKytdID0gKChwICYgMTUpIDw8IDQpIHwgKChiICYgNjApID4+IDIpO1xuICAgICAgICAgICAgICAgIHAgPSBiO1xuICAgICAgICAgICAgICAgIGdyb3VwUG9zID0gMztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgMzpcbiAgICAgICAgICAgICAgICBieXRlc1tieXRlUG9zKytdID0gKChwICYgMykgPDwgNikgfCBiO1xuICAgICAgICAgICAgICAgIGdyb3VwUG9zID0gMDtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoZ3JvdXBQb3MgPT0gMSlcbiAgICAgICAgdGhyb3cgRXJyb3IoXCJpbnZhbGlkIGJhc2U2NCBzdHJpbmdcIik7XG4gICAgcmV0dXJuIGJ5dGVzLnN1YmFycmF5KDAsIGJ5dGVQb3MpO1xufVxuLyoqXG4gKiBFbmNvZGUgYSBieXRlIGFycmF5IHRvIGEgYmFzZTY0IHN0cmluZy5cbiAqXG4gKiBCeSBkZWZhdWx0LCB0aGlzIGZ1bmN0aW9uIHVzZXMgdGhlIHN0YW5kYXJkIGJhc2U2NCBlbmNvZGluZyB3aXRoIHBhZGRpbmcuXG4gKlxuICogVG8gZW5jb2RlIHdpdGhvdXQgcGFkZGluZywgdXNlIGVuY29kaW5nID0gXCJzdGRfcmF3XCIuXG4gKlxuICogVG8gZW5jb2RlIHdpdGggdGhlIFVSTCBlbmNvZGluZywgdXNlIGVuY29kaW5nID0gXCJ1cmxcIiwgd2hpY2ggcmVwbGFjZXMgdGhlXG4gKiBjaGFyYWN0ZXJzICsvIGJ5IHRoZWlyIFVSTC1zYWZlIGNvdW50ZXJwYXJ0cyAtXywgYW5kIG9taXRzIHBhZGRpbmcuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYXNlNjRFbmNvZGUoYnl0ZXMsIGVuY29kaW5nID0gXCJzdGRcIikge1xuICAgIGNvbnN0IHRhYmxlID0gZ2V0RW5jb2RlVGFibGUoZW5jb2RpbmcpO1xuICAgIGNvbnN0IHBhZCA9IGVuY29kaW5nID09IFwic3RkXCI7XG4gICAgbGV0IGJhc2U2NCA9IFwiXCIsIGdyb3VwUG9zID0gMCwgLy8gcG9zaXRpb24gaW4gYmFzZTY0IGdyb3VwXG4gICAgYiwgLy8gY3VycmVudCBieXRlXG4gICAgcCA9IDA7IC8vIGNhcnJ5IG92ZXIgZnJvbSBwcmV2aW91cyBieXRlXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBieXRlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICBiID0gYnl0ZXNbaV07XG4gICAgICAgIHN3aXRjaCAoZ3JvdXBQb3MpIHtcbiAgICAgICAgICAgIGNhc2UgMDpcbiAgICAgICAgICAgICAgICBiYXNlNjQgKz0gdGFibGVbYiA+PiAyXTtcbiAgICAgICAgICAgICAgICBwID0gKGIgJiAzKSA8PCA0O1xuICAgICAgICAgICAgICAgIGdyb3VwUG9zID0gMTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgMTpcbiAgICAgICAgICAgICAgICBiYXNlNjQgKz0gdGFibGVbcCB8IChiID4+IDQpXTtcbiAgICAgICAgICAgICAgICBwID0gKGIgJiAxNSkgPDwgMjtcbiAgICAgICAgICAgICAgICBncm91cFBvcyA9IDI7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDI6XG4gICAgICAgICAgICAgICAgYmFzZTY0ICs9IHRhYmxlW3AgfCAoYiA+PiA2KV07XG4gICAgICAgICAgICAgICAgYmFzZTY0ICs9IHRhYmxlW2IgJiA2M107XG4gICAgICAgICAgICAgICAgZ3JvdXBQb3MgPSAwO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuICAgIC8vIGFkZCBvdXRwdXQgcGFkZGluZ1xuICAgIGlmIChncm91cFBvcykge1xuICAgICAgICBiYXNlNjQgKz0gdGFibGVbcF07XG4gICAgICAgIGlmIChwYWQpIHtcbiAgICAgICAgICAgIGJhc2U2NCArPSBcIj1cIjtcbiAgICAgICAgICAgIGlmIChncm91cFBvcyA9PSAxKVxuICAgICAgICAgICAgICAgIGJhc2U2NCArPSBcIj1cIjtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYmFzZTY0O1xufVxuLy8gbG9va3VwIHRhYmxlIGZyb20gYmFzZTY0IGNoYXJhY3RlciB0byBieXRlXG5sZXQgZW5jb2RlVGFibGVTdGQ7XG5sZXQgZW5jb2RlVGFibGVVcmw7XG4vLyBsb29rdXAgdGFibGUgZnJvbSBiYXNlNjQgY2hhcmFjdGVyICpjb2RlKiB0byBieXRlIGJlY2F1c2UgbG9va3VwIGJ5IG51bWJlciBpcyBmYXN0XG5sZXQgZGVjb2RlVGFibGU7XG5mdW5jdGlvbiBnZXRFbmNvZGVUYWJsZShlbmNvZGluZykge1xuICAgIGlmICghZW5jb2RlVGFibGVTdGQpIHtcbiAgICAgICAgZW5jb2RlVGFibGVTdGQgPVxuICAgICAgICAgICAgXCJBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvXCIuc3BsaXQoXCJcIik7XG4gICAgICAgIGVuY29kZVRhYmxlVXJsID0gZW5jb2RlVGFibGVTdGQuc2xpY2UoMCwgLTIpLmNvbmNhdChcIi1cIiwgXCJfXCIpO1xuICAgIH1cbiAgICByZXR1cm4gZW5jb2RpbmcgPT0gXCJ1cmxcIlxuICAgICAgICA/IC8vIGJpb21lLWlnbm9yZSBsaW50L3N0eWxlL25vTm9uTnVsbEFzc2VydGlvbjogVFMgZmFpbHMgdG8gbmFycm93IGRvd25cbiAgICAgICAgICAgIGVuY29kZVRhYmxlVXJsXG4gICAgICAgIDogZW5jb2RlVGFibGVTdGQ7XG59XG5mdW5jdGlvbiBnZXREZWNvZGVUYWJsZSgpIHtcbiAgICBpZiAoIWRlY29kZVRhYmxlKSB7XG4gICAgICAgIGRlY29kZVRhYmxlID0gW107XG4gICAgICAgIGNvbnN0IGVuY29kZVRhYmxlID0gZ2V0RW5jb2RlVGFibGUoXCJzdGRcIik7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZW5jb2RlVGFibGUubGVuZ3RoOyBpKyspXG4gICAgICAgICAgICBkZWNvZGVUYWJsZVtlbmNvZGVUYWJsZVtpXS5jaGFyQ29kZUF0KDApXSA9IGk7XG4gICAgICAgIC8vIHN1cHBvcnQgYmFzZTY0dXJsIHZhcmlhbnRzXG4gICAgICAgIGRlY29kZVRhYmxlW1wiLVwiLmNoYXJDb2RlQXQoMCldID0gZW5jb2RlVGFibGUuaW5kZXhPZihcIitcIik7XG4gICAgICAgIGRlY29kZVRhYmxlW1wiX1wiLmNoYXJDb2RlQXQoMCldID0gZW5jb2RlVGFibGUuaW5kZXhPZihcIi9cIik7XG4gICAgfVxuICAgIHJldHVybiBkZWNvZGVUYWJsZTtcbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuLyoqXG4gKiBEZXRlcm1pbmUgd2hldGhlciB0aGUgZ2l2ZW4gYGFyZ2AgaXMgYSBtZXNzYWdlLlxuICogSWYgYGRlc2NgIGlzIHNldCwgZGV0ZXJtaW5lIHdoZXRoZXIgYGFyZ2AgaXMgdGhpcyBzcGVjaWZpYyBtZXNzYWdlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNNZXNzYWdlKGFyZywgc2NoZW1hKSB7XG4gICAgY29uc3QgaXNNZXNzYWdlID0gYXJnICE9PSBudWxsICYmXG4gICAgICAgIHR5cGVvZiBhcmcgPT0gXCJvYmplY3RcIiAmJlxuICAgICAgICBcIiR0eXBlTmFtZVwiIGluIGFyZyAmJlxuICAgICAgICB0eXBlb2YgYXJnLiR0eXBlTmFtZSA9PSBcInN0cmluZ1wiO1xuICAgIGlmICghaXNNZXNzYWdlKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgaWYgKHNjaGVtYSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gc2NoZW1hLnR5cGVOYW1lID09PSBhcmcuJHR5cGVOYW1lO1xufVxuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5jb25zdCBlcnJvck5hbWVzID0gW1xuICAgIFwiRmllbGRWYWx1ZUludmFsaWRFcnJvclwiLFxuICAgIFwiRmllbGRMaXN0UmFuZ2VFcnJvclwiLFxuICAgIFwiRm9yZWlnbkZpZWxkRXJyb3JcIixcbl07XG5leHBvcnQgY2xhc3MgRmllbGRFcnJvciBleHRlbmRzIEVycm9yIHtcbiAgICBjb25zdHJ1Y3RvcihmaWVsZE9yT25lb2YsIG1lc3NhZ2UsIG5hbWUgPSBcIkZpZWxkVmFsdWVJbnZhbGlkRXJyb3JcIikge1xuICAgICAgICBzdXBlcihtZXNzYWdlKTtcbiAgICAgICAgdGhpcy5uYW1lID0gbmFtZTtcbiAgICAgICAgdGhpcy5maWVsZCA9ICgpID0+IGZpZWxkT3JPbmVvZjtcbiAgICB9XG59XG5leHBvcnQgZnVuY3Rpb24gaXNGaWVsZEVycm9yKGFyZykge1xuICAgIHJldHVybiAoYXJnIGluc3RhbmNlb2YgRXJyb3IgJiZcbiAgICAgICAgZXJyb3JOYW1lcy5pbmNsdWRlcyhhcmcubmFtZSkgJiZcbiAgICAgICAgXCJmaWVsZFwiIGluIGFyZyAmJlxuICAgICAgICB0eXBlb2YgYXJnLmZpZWxkID09IFwiZnVuY3Rpb25cIik7XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbmltcG9ydCB7IHVuc2FmZUxvY2FsIH0gZnJvbSBcIi4vdW5zYWZlLmpzXCI7XG5leHBvcnQgZnVuY3Rpb24gaXNPYmplY3QoYXJnKSB7XG4gICAgcmV0dXJuIGFyZyAhPT0gbnVsbCAmJiB0eXBlb2YgYXJnID09IFwib2JqZWN0XCIgJiYgIUFycmF5LmlzQXJyYXkoYXJnKTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBpc09uZW9mQURUKGFyZykge1xuICAgIHJldHVybiAoYXJnICE9PSBudWxsICYmXG4gICAgICAgIHR5cGVvZiBhcmcgPT0gXCJvYmplY3RcIiAmJlxuICAgICAgICBcImNhc2VcIiBpbiBhcmcgJiZcbiAgICAgICAgKCh0eXBlb2YgYXJnLmNhc2UgPT0gXCJzdHJpbmdcIiAmJiBcInZhbHVlXCIgaW4gYXJnICYmIGFyZy52YWx1ZSAhPSBudWxsKSB8fFxuICAgICAgICAgICAgKGFyZy5jYXNlID09PSB1bmRlZmluZWQgJiZcbiAgICAgICAgICAgICAgICAoIShcInZhbHVlXCIgaW4gYXJnKSB8fCBhcmcudmFsdWUgPT09IHVuZGVmaW5lZCkpKSk7XG59XG5leHBvcnQgZnVuY3Rpb24gaXNSZWZsZWN0TGlzdChhcmcsIGZpZWxkKSB7XG4gICAgdmFyIF9hLCBfYiwgX2MsIF9kO1xuICAgIGlmIChpc09iamVjdChhcmcpICYmXG4gICAgICAgIHVuc2FmZUxvY2FsIGluIGFyZyAmJlxuICAgICAgICBcImFkZFwiIGluIGFyZyAmJlxuICAgICAgICBcImZpZWxkXCIgaW4gYXJnICYmXG4gICAgICAgIHR5cGVvZiBhcmcuZmllbGQgPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgIGlmIChmaWVsZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb25zdCBhID0gZmllbGQ7XG4gICAgICAgICAgICBjb25zdCBiID0gYXJnLmZpZWxkKCk7XG4gICAgICAgICAgICByZXR1cm4gKGEubGlzdEtpbmQgPT0gYi5saXN0S2luZCAmJlxuICAgICAgICAgICAgICAgIGEuc2NhbGFyID09PSBiLnNjYWxhciAmJlxuICAgICAgICAgICAgICAgICgoX2EgPSBhLm1lc3NhZ2UpID09PSBudWxsIHx8IF9hID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfYS50eXBlTmFtZSkgPT09ICgoX2IgPSBiLm1lc3NhZ2UpID09PSBudWxsIHx8IF9iID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfYi50eXBlTmFtZSkgJiZcbiAgICAgICAgICAgICAgICAoKF9jID0gYS5lbnVtKSA9PT0gbnVsbCB8fCBfYyA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2MudHlwZU5hbWUpID09PSAoKF9kID0gYi5lbnVtKSA9PT0gbnVsbCB8fCBfZCA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2QudHlwZU5hbWUpKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGlzUmVmbGVjdE1hcChhcmcsIGZpZWxkKSB7XG4gICAgdmFyIF9hLCBfYiwgX2MsIF9kO1xuICAgIGlmIChpc09iamVjdChhcmcpICYmXG4gICAgICAgIHVuc2FmZUxvY2FsIGluIGFyZyAmJlxuICAgICAgICBcImhhc1wiIGluIGFyZyAmJlxuICAgICAgICBcImZpZWxkXCIgaW4gYXJnICYmXG4gICAgICAgIHR5cGVvZiBhcmcuZmllbGQgPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgIGlmIChmaWVsZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjb25zdCBhID0gZmllbGQsIGIgPSBhcmcuZmllbGQoKTtcbiAgICAgICAgICAgIHJldHVybiAoYS5tYXBLZXkgPT09IGIubWFwS2V5ICYmXG4gICAgICAgICAgICAgICAgYS5tYXBLaW5kID09IGIubWFwS2luZCAmJlxuICAgICAgICAgICAgICAgIGEuc2NhbGFyID09PSBiLnNjYWxhciAmJlxuICAgICAgICAgICAgICAgICgoX2EgPSBhLm1lc3NhZ2UpID09PSBudWxsIHx8IF9hID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfYS50eXBlTmFtZSkgPT09ICgoX2IgPSBiLm1lc3NhZ2UpID09PSBudWxsIHx8IF9iID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfYi50eXBlTmFtZSkgJiZcbiAgICAgICAgICAgICAgICAoKF9jID0gYS5lbnVtKSA9PT0gbnVsbCB8fCBfYyA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2MudHlwZU5hbWUpID09PSAoKF9kID0gYi5lbnVtKSA9PT0gbnVsbCB8fCBfZCA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2QudHlwZU5hbWUpKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGlzUmVmbGVjdE1lc3NhZ2UoYXJnLCBtZXNzYWdlRGVzYykge1xuICAgIHJldHVybiAoaXNPYmplY3QoYXJnKSAmJlxuICAgICAgICB1bnNhZmVMb2NhbCBpbiBhcmcgJiZcbiAgICAgICAgXCJkZXNjXCIgaW4gYXJnICYmXG4gICAgICAgIGlzT2JqZWN0KGFyZy5kZXNjKSAmJlxuICAgICAgICBhcmcuZGVzYy5raW5kID09PSBcIm1lc3NhZ2VcIiAmJlxuICAgICAgICAobWVzc2FnZURlc2MgPT09IHVuZGVmaW5lZCB8fCBhcmcuZGVzYy50eXBlTmFtZSA9PSBtZXNzYWdlRGVzYy50eXBlTmFtZSkpO1xufVxuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5jb25zdCBzeW1ib2wgPSBTeW1ib2wuZm9yKFwiQGJ1ZmJ1aWxkL3Byb3RvYnVmL3RleHQtZW5jb2RpbmdcIik7XG4vKipcbiAqIFByb3RvYnVmLUVTIHJlcXVpcmVzIHRoZSBUZXh0IEVuY29kaW5nIEFQSSB0byBjb252ZXJ0IFVURi04IGZyb20gYW5kIHRvXG4gKiBiaW5hcnkuIFRoaXMgV0hBVFdHIEFQSSBpcyB3aWRlbHkgYXZhaWxhYmxlLCBidXQgaXQgaXMgbm90IHBhcnQgb2YgdGhlXG4gKiBFQ01BU2NyaXB0IHN0YW5kYXJkLiBPbiBydW50aW1lcyB3aGVyZSBpdCBpcyBub3QgYXZhaWxhYmxlLCB1c2UgdGhpc1xuICogZnVuY3Rpb24gdG8gcHJvdmlkZSB5b3VyIG93biBpbXBsZW1lbnRhdGlvbi5cbiAqXG4gKiBOb3RlIHRoYXQgdGhlIFRleHQgRW5jb2RpbmcgQVBJIGRvZXMgbm90IHByb3ZpZGUgYSB3YXkgdG8gdmFsaWRhdGUgVVRGLTguXG4gKiBPdXIgaW1wbGVtZW50YXRpb24gZmFsbHMgYmFjayB0byB1c2UgZW5jb2RlVVJJQ29tcG9uZW50KCkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb25maWd1cmVUZXh0RW5jb2RpbmcodGV4dEVuY29kaW5nKSB7XG4gICAgZ2xvYmFsVGhpc1tzeW1ib2xdID0gdGV4dEVuY29kaW5nO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGdldFRleHRFbmNvZGluZygpIHtcbiAgICBpZiAoZ2xvYmFsVGhpc1tzeW1ib2xdID09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCB0ZSA9IG5ldyBnbG9iYWxUaGlzLlRleHRFbmNvZGVyKCk7XG4gICAgICAgIGNvbnN0IHRkID0gbmV3IGdsb2JhbFRoaXMuVGV4dERlY29kZXIoKTtcbiAgICAgICAgZ2xvYmFsVGhpc1tzeW1ib2xdID0ge1xuICAgICAgICAgICAgZW5jb2RlVXRmOCh0ZXh0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRlLmVuY29kZSh0ZXh0KTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBkZWNvZGVVdGY4KGJ5dGVzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRkLmRlY29kZShieXRlcyk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgY2hlY2tVdGY4KHRleHQpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBlbmNvZGVVUklDb21wb25lbnQodGV4dCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXRjaCAoXykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIGdsb2JhbFRoaXNbc3ltYm9sXTtcbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuaW1wb3J0IHsgdmFyaW50MzJyZWFkLCB2YXJpbnQzMndyaXRlLCB2YXJpbnQ2NHJlYWQsIHZhcmludDY0d3JpdGUsIH0gZnJvbSBcIi4vdmFyaW50LmpzXCI7XG5pbXBvcnQgeyBwcm90b0ludDY0IH0gZnJvbSBcIi4uL3Byb3RvLWludDY0LmpzXCI7XG5pbXBvcnQgeyBnZXRUZXh0RW5jb2RpbmcgfSBmcm9tIFwiLi90ZXh0LWVuY29kaW5nLmpzXCI7XG4vKipcbiAqIFByb3RvYnVmIGJpbmFyeSBmb3JtYXQgd2lyZSB0eXBlcy5cbiAqXG4gKiBBIHdpcmUgdHlwZSBwcm92aWRlcyBqdXN0IGVub3VnaCBpbmZvcm1hdGlvbiB0byBmaW5kIHRoZSBsZW5ndGggb2YgdGhlXG4gKiBmb2xsb3dpbmcgdmFsdWUuXG4gKlxuICogU2VlIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL3Byb3RvY29sLWJ1ZmZlcnMvZG9jcy9lbmNvZGluZyNzdHJ1Y3R1cmVcbiAqL1xuZXhwb3J0IHZhciBXaXJlVHlwZTtcbihmdW5jdGlvbiAoV2lyZVR5cGUpIHtcbiAgICAvKipcbiAgICAgKiBVc2VkIGZvciBpbnQzMiwgaW50NjQsIHVpbnQzMiwgdWludDY0LCBzaW50MzIsIHNpbnQ2NCwgYm9vbCwgZW51bVxuICAgICAqL1xuICAgIFdpcmVUeXBlW1dpcmVUeXBlW1wiVmFyaW50XCJdID0gMF0gPSBcIlZhcmludFwiO1xuICAgIC8qKlxuICAgICAqIFVzZWQgZm9yIGZpeGVkNjQsIHNmaXhlZDY0LCBkb3VibGUuXG4gICAgICogQWx3YXlzIDggYnl0ZXMgd2l0aCBsaXR0bGUtZW5kaWFuIGJ5dGUgb3JkZXIuXG4gICAgICovXG4gICAgV2lyZVR5cGVbV2lyZVR5cGVbXCJCaXQ2NFwiXSA9IDFdID0gXCJCaXQ2NFwiO1xuICAgIC8qKlxuICAgICAqIFVzZWQgZm9yIHN0cmluZywgYnl0ZXMsIGVtYmVkZGVkIG1lc3NhZ2VzLCBwYWNrZWQgcmVwZWF0ZWQgZmllbGRzXG4gICAgICpcbiAgICAgKiBPbmx5IHJlcGVhdGVkIG51bWVyaWMgdHlwZXMgKHR5cGVzIHdoaWNoIHVzZSB0aGUgdmFyaW50LCAzMi1iaXQsXG4gICAgICogb3IgNjQtYml0IHdpcmUgdHlwZXMpIGNhbiBiZSBwYWNrZWQuIEluIHByb3RvMywgc3VjaCBmaWVsZHMgYXJlXG4gICAgICogcGFja2VkIGJ5IGRlZmF1bHQuXG4gICAgICovXG4gICAgV2lyZVR5cGVbV2lyZVR5cGVbXCJMZW5ndGhEZWxpbWl0ZWRcIl0gPSAyXSA9IFwiTGVuZ3RoRGVsaW1pdGVkXCI7XG4gICAgLyoqXG4gICAgICogU3RhcnQgb2YgYSB0YWctZGVsaW1pdGVkIGFnZ3JlZ2F0ZSwgc3VjaCBhcyBhIHByb3RvMiBncm91cCwgb3IgYSBtZXNzYWdlXG4gICAgICogaW4gZWRpdGlvbnMgd2l0aCBtZXNzYWdlX2VuY29kaW5nID0gREVMSU1JVEVELlxuICAgICAqL1xuICAgIFdpcmVUeXBlW1dpcmVUeXBlW1wiU3RhcnRHcm91cFwiXSA9IDNdID0gXCJTdGFydEdyb3VwXCI7XG4gICAgLyoqXG4gICAgICogRW5kIG9mIGEgdGFnLWRlbGltaXRlZCBhZ2dyZWdhdGUuXG4gICAgICovXG4gICAgV2lyZVR5cGVbV2lyZVR5cGVbXCJFbmRHcm91cFwiXSA9IDRdID0gXCJFbmRHcm91cFwiO1xuICAgIC8qKlxuICAgICAqIFVzZWQgZm9yIGZpeGVkMzIsIHNmaXhlZDMyLCBmbG9hdC5cbiAgICAgKiBBbHdheXMgNCBieXRlcyB3aXRoIGxpdHRsZS1lbmRpYW4gYnl0ZSBvcmRlci5cbiAgICAgKi9cbiAgICBXaXJlVHlwZVtXaXJlVHlwZVtcIkJpdDMyXCJdID0gNV0gPSBcIkJpdDMyXCI7XG59KShXaXJlVHlwZSB8fCAoV2lyZVR5cGUgPSB7fSkpO1xuLyoqXG4gKiBNYXhpbXVtIHZhbHVlIGZvciBhIDMyLWJpdCBmbG9hdGluZyBwb2ludCB2YWx1ZSAoUHJvdG9idWYgRkxPQVQpLlxuICovXG5leHBvcnQgY29uc3QgRkxPQVQzMl9NQVggPSAzLjQwMjgyMzQ2NjM4NTI4ODZlMzg7XG4vKipcbiAqIE1pbmltdW0gdmFsdWUgZm9yIGEgMzItYml0IGZsb2F0aW5nIHBvaW50IHZhbHVlIChQcm90b2J1ZiBGTE9BVCkuXG4gKi9cbmV4cG9ydCBjb25zdCBGTE9BVDMyX01JTiA9IC0zLjQwMjgyMzQ2NjM4NTI4ODZlMzg7XG4vKipcbiAqIE1heGltdW0gdmFsdWUgZm9yIGFuIHVuc2lnbmVkIDMyLWJpdCBpbnRlZ2VyIChQcm90b2J1ZiBVSU5UMzIsIEZJWEVEMzIpLlxuICovXG5leHBvcnQgY29uc3QgVUlOVDMyX01BWCA9IDB4ZmZmZmZmZmY7XG4vKipcbiAqIE1heGltdW0gdmFsdWUgZm9yIGEgc2lnbmVkIDMyLWJpdCBpbnRlZ2VyIChQcm90b2J1ZiBJTlQzMiwgU0ZJWEVEMzIsIFNJTlQzMikuXG4gKi9cbmV4cG9ydCBjb25zdCBJTlQzMl9NQVggPSAweDdmZmZmZmZmO1xuLyoqXG4gKiBNaW5pbXVtIHZhbHVlIGZvciBhIHNpZ25lZCAzMi1iaXQgaW50ZWdlciAoUHJvdG9idWYgSU5UMzIsIFNGSVhFRDMyLCBTSU5UMzIpLlxuICovXG5leHBvcnQgY29uc3QgSU5UMzJfTUlOID0gLTB4ODAwMDAwMDA7XG5leHBvcnQgY2xhc3MgQmluYXJ5V3JpdGVyIHtcbiAgICBjb25zdHJ1Y3RvcihlbmNvZGVVdGY4ID0gZ2V0VGV4dEVuY29kaW5nKCkuZW5jb2RlVXRmOCkge1xuICAgICAgICB0aGlzLmVuY29kZVV0ZjggPSBlbmNvZGVVdGY4O1xuICAgICAgICAvKipcbiAgICAgICAgICogUHJldmlvdXMgZm9yayBzdGF0ZXMuXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLnN0YWNrID0gW107XG4gICAgICAgIHRoaXMuY2h1bmtzID0gW107XG4gICAgICAgIHRoaXMuYnVmID0gW107XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFJldHVybiBhbGwgYnl0ZXMgd3JpdHRlbiBhbmQgcmVzZXQgdGhpcyB3cml0ZXIuXG4gICAgICovXG4gICAgZmluaXNoKCkge1xuICAgICAgICBpZiAodGhpcy5idWYubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aGlzLmNodW5rcy5wdXNoKG5ldyBVaW50OEFycmF5KHRoaXMuYnVmKSk7IC8vIGZsdXNoIHRoZSBidWZmZXJcbiAgICAgICAgICAgIHRoaXMuYnVmID0gW107XG4gICAgICAgIH1cbiAgICAgICAgbGV0IGxlbiA9IDA7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5jaHVua3MubGVuZ3RoOyBpKyspXG4gICAgICAgICAgICBsZW4gKz0gdGhpcy5jaHVua3NbaV0ubGVuZ3RoO1xuICAgICAgICBsZXQgYnl0ZXMgPSBuZXcgVWludDhBcnJheShsZW4pO1xuICAgICAgICBsZXQgb2Zmc2V0ID0gMDtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmNodW5rcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYnl0ZXMuc2V0KHRoaXMuY2h1bmtzW2ldLCBvZmZzZXQpO1xuICAgICAgICAgICAgb2Zmc2V0ICs9IHRoaXMuY2h1bmtzW2ldLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNodW5rcyA9IFtdO1xuICAgICAgICByZXR1cm4gYnl0ZXM7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFN0YXJ0IGEgbmV3IGZvcmsgZm9yIGxlbmd0aC1kZWxpbWl0ZWQgZGF0YSBsaWtlIGEgbWVzc2FnZVxuICAgICAqIG9yIGEgcGFja2VkIHJlcGVhdGVkIGZpZWxkLlxuICAgICAqXG4gICAgICogTXVzdCBiZSBqb2luZWQgbGF0ZXIgd2l0aCBgam9pbigpYC5cbiAgICAgKi9cbiAgICBmb3JrKCkge1xuICAgICAgICB0aGlzLnN0YWNrLnB1c2goeyBjaHVua3M6IHRoaXMuY2h1bmtzLCBidWY6IHRoaXMuYnVmIH0pO1xuICAgICAgICB0aGlzLmNodW5rcyA9IFtdO1xuICAgICAgICB0aGlzLmJ1ZiA9IFtdO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgLyoqXG4gICAgICogSm9pbiB0aGUgbGFzdCBmb3JrLiBXcml0ZSBpdHMgbGVuZ3RoIGFuZCBieXRlcywgdGhlblxuICAgICAqIHJldHVybiB0byB0aGUgcHJldmlvdXMgc3RhdGUuXG4gICAgICovXG4gICAgam9pbigpIHtcbiAgICAgICAgLy8gZ2V0IGNodW5rIG9mIGZvcmtcbiAgICAgICAgbGV0IGNodW5rID0gdGhpcy5maW5pc2goKTtcbiAgICAgICAgLy8gcmVzdG9yZSBwcmV2aW91cyBzdGF0ZVxuICAgICAgICBsZXQgcHJldiA9IHRoaXMuc3RhY2sucG9wKCk7XG4gICAgICAgIGlmICghcHJldilcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImludmFsaWQgc3RhdGUsIGZvcmsgc3RhY2sgZW1wdHlcIik7XG4gICAgICAgIHRoaXMuY2h1bmtzID0gcHJldi5jaHVua3M7XG4gICAgICAgIHRoaXMuYnVmID0gcHJldi5idWY7XG4gICAgICAgIC8vIHdyaXRlIGxlbmd0aCBvZiBjaHVuayBhcyB2YXJpbnRcbiAgICAgICAgdGhpcy51aW50MzIoY2h1bmsuYnl0ZUxlbmd0aCk7XG4gICAgICAgIHJldHVybiB0aGlzLnJhdyhjaHVuayk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFdyaXRlcyBhIHRhZyAoZmllbGQgbnVtYmVyIGFuZCB3aXJlIHR5cGUpLlxuICAgICAqXG4gICAgICogRXF1aXZhbGVudCB0byBgdWludDMyKCAoZmllbGRObyA8PCAzIHwgdHlwZSkgPj4+IDAgKWAuXG4gICAgICpcbiAgICAgKiBHZW5lcmF0ZWQgY29kZSBzaG91bGQgY29tcHV0ZSB0aGUgdGFnIGFoZWFkIG9mIHRpbWUgYW5kIGNhbGwgYHVpbnQzMigpYC5cbiAgICAgKi9cbiAgICB0YWcoZmllbGRObywgdHlwZSkge1xuICAgICAgICByZXR1cm4gdGhpcy51aW50MzIoKChmaWVsZE5vIDw8IDMpIHwgdHlwZSkgPj4+IDApO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBXcml0ZSBhIGNodW5rIG9mIHJhdyBieXRlcy5cbiAgICAgKi9cbiAgICByYXcoY2h1bmspIHtcbiAgICAgICAgaWYgKHRoaXMuYnVmLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhpcy5jaHVua3MucHVzaChuZXcgVWludDhBcnJheSh0aGlzLmJ1ZikpO1xuICAgICAgICAgICAgdGhpcy5idWYgPSBbXTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNodW5rcy5wdXNoKGNodW5rKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFdyaXRlIGEgYHVpbnQzMmAgdmFsdWUsIGFuIHVuc2lnbmVkIDMyIGJpdCB2YXJpbnQuXG4gICAgICovXG4gICAgdWludDMyKHZhbHVlKSB7XG4gICAgICAgIGFzc2VydFVJbnQzMih2YWx1ZSk7XG4gICAgICAgIC8vIHdyaXRlIHZhbHVlIGFzIHZhcmludCAzMiwgaW5saW5lZCBmb3Igc3BlZWRcbiAgICAgICAgd2hpbGUgKHZhbHVlID4gMHg3Zikge1xuICAgICAgICAgICAgdGhpcy5idWYucHVzaCgodmFsdWUgJiAweDdmKSB8IDB4ODApO1xuICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZSA+Pj4gNztcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmJ1Zi5wdXNoKHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFdyaXRlIGEgYGludDMyYCB2YWx1ZSwgYSBzaWduZWQgMzIgYml0IHZhcmludC5cbiAgICAgKi9cbiAgICBpbnQzMih2YWx1ZSkge1xuICAgICAgICBhc3NlcnRJbnQzMih2YWx1ZSk7XG4gICAgICAgIHZhcmludDMyd3JpdGUodmFsdWUsIHRoaXMuYnVmKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFdyaXRlIGEgYGJvb2xgIHZhbHVlLCBhIHZhcmlhbnQuXG4gICAgICovXG4gICAgYm9vbCh2YWx1ZSkge1xuICAgICAgICB0aGlzLmJ1Zi5wdXNoKHZhbHVlID8gMSA6IDApO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgLyoqXG4gICAgICogV3JpdGUgYSBgYnl0ZXNgIHZhbHVlLCBsZW5ndGgtZGVsaW1pdGVkIGFyYml0cmFyeSBkYXRhLlxuICAgICAqL1xuICAgIGJ5dGVzKHZhbHVlKSB7XG4gICAgICAgIHRoaXMudWludDMyKHZhbHVlLmJ5dGVMZW5ndGgpOyAvLyB3cml0ZSBsZW5ndGggb2YgY2h1bmsgYXMgdmFyaW50XG4gICAgICAgIHJldHVybiB0aGlzLnJhdyh2YWx1ZSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFdyaXRlIGEgYHN0cmluZ2AgdmFsdWUsIGxlbmd0aC1kZWxpbWl0ZWQgZGF0YSBjb252ZXJ0ZWQgdG8gVVRGLTggdGV4dC5cbiAgICAgKi9cbiAgICBzdHJpbmcodmFsdWUpIHtcbiAgICAgICAgbGV0IGNodW5rID0gdGhpcy5lbmNvZGVVdGY4KHZhbHVlKTtcbiAgICAgICAgdGhpcy51aW50MzIoY2h1bmsuYnl0ZUxlbmd0aCk7IC8vIHdyaXRlIGxlbmd0aCBvZiBjaHVuayBhcyB2YXJpbnRcbiAgICAgICAgcmV0dXJuIHRoaXMucmF3KGNodW5rKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogV3JpdGUgYSBgZmxvYXRgIHZhbHVlLCAzMi1iaXQgZmxvYXRpbmcgcG9pbnQgbnVtYmVyLlxuICAgICAqL1xuICAgIGZsb2F0KHZhbHVlKSB7XG4gICAgICAgIGFzc2VydEZsb2F0MzIodmFsdWUpO1xuICAgICAgICBsZXQgY2h1bmsgPSBuZXcgVWludDhBcnJheSg0KTtcbiAgICAgICAgbmV3IERhdGFWaWV3KGNodW5rLmJ1ZmZlcikuc2V0RmxvYXQzMigwLCB2YWx1ZSwgdHJ1ZSk7XG4gICAgICAgIHJldHVybiB0aGlzLnJhdyhjaHVuayk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFdyaXRlIGEgYGRvdWJsZWAgdmFsdWUsIGEgNjQtYml0IGZsb2F0aW5nIHBvaW50IG51bWJlci5cbiAgICAgKi9cbiAgICBkb3VibGUodmFsdWUpIHtcbiAgICAgICAgbGV0IGNodW5rID0gbmV3IFVpbnQ4QXJyYXkoOCk7XG4gICAgICAgIG5ldyBEYXRhVmlldyhjaHVuay5idWZmZXIpLnNldEZsb2F0NjQoMCwgdmFsdWUsIHRydWUpO1xuICAgICAgICByZXR1cm4gdGhpcy5yYXcoY2h1bmspO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBXcml0ZSBhIGBmaXhlZDMyYCB2YWx1ZSwgYW4gdW5zaWduZWQsIGZpeGVkLWxlbmd0aCAzMi1iaXQgaW50ZWdlci5cbiAgICAgKi9cbiAgICBmaXhlZDMyKHZhbHVlKSB7XG4gICAgICAgIGFzc2VydFVJbnQzMih2YWx1ZSk7XG4gICAgICAgIGxldCBjaHVuayA9IG5ldyBVaW50OEFycmF5KDQpO1xuICAgICAgICBuZXcgRGF0YVZpZXcoY2h1bmsuYnVmZmVyKS5zZXRVaW50MzIoMCwgdmFsdWUsIHRydWUpO1xuICAgICAgICByZXR1cm4gdGhpcy5yYXcoY2h1bmspO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBXcml0ZSBhIGBzZml4ZWQzMmAgdmFsdWUsIGEgc2lnbmVkLCBmaXhlZC1sZW5ndGggMzItYml0IGludGVnZXIuXG4gICAgICovXG4gICAgc2ZpeGVkMzIodmFsdWUpIHtcbiAgICAgICAgYXNzZXJ0SW50MzIodmFsdWUpO1xuICAgICAgICBsZXQgY2h1bmsgPSBuZXcgVWludDhBcnJheSg0KTtcbiAgICAgICAgbmV3IERhdGFWaWV3KGNodW5rLmJ1ZmZlcikuc2V0SW50MzIoMCwgdmFsdWUsIHRydWUpO1xuICAgICAgICByZXR1cm4gdGhpcy5yYXcoY2h1bmspO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBXcml0ZSBhIGBzaW50MzJgIHZhbHVlLCBhIHNpZ25lZCwgemlnemFnLWVuY29kZWQgMzItYml0IHZhcmludC5cbiAgICAgKi9cbiAgICBzaW50MzIodmFsdWUpIHtcbiAgICAgICAgYXNzZXJ0SW50MzIodmFsdWUpO1xuICAgICAgICAvLyB6aWd6YWcgZW5jb2RlXG4gICAgICAgIHZhbHVlID0gKCh2YWx1ZSA8PCAxKSBeICh2YWx1ZSA+PiAzMSkpID4+PiAwO1xuICAgICAgICB2YXJpbnQzMndyaXRlKHZhbHVlLCB0aGlzLmJ1Zik7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBXcml0ZSBhIGBmaXhlZDY0YCB2YWx1ZSwgYSBzaWduZWQsIGZpeGVkLWxlbmd0aCA2NC1iaXQgaW50ZWdlci5cbiAgICAgKi9cbiAgICBzZml4ZWQ2NCh2YWx1ZSkge1xuICAgICAgICBsZXQgY2h1bmsgPSBuZXcgVWludDhBcnJheSg4KSwgdmlldyA9IG5ldyBEYXRhVmlldyhjaHVuay5idWZmZXIpLCB0YyA9IHByb3RvSW50NjQuZW5jKHZhbHVlKTtcbiAgICAgICAgdmlldy5zZXRJbnQzMigwLCB0Yy5sbywgdHJ1ZSk7XG4gICAgICAgIHZpZXcuc2V0SW50MzIoNCwgdGMuaGksIHRydWUpO1xuICAgICAgICByZXR1cm4gdGhpcy5yYXcoY2h1bmspO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBXcml0ZSBhIGBmaXhlZDY0YCB2YWx1ZSwgYW4gdW5zaWduZWQsIGZpeGVkLWxlbmd0aCA2NCBiaXQgaW50ZWdlci5cbiAgICAgKi9cbiAgICBmaXhlZDY0KHZhbHVlKSB7XG4gICAgICAgIGxldCBjaHVuayA9IG5ldyBVaW50OEFycmF5KDgpLCB2aWV3ID0gbmV3IERhdGFWaWV3KGNodW5rLmJ1ZmZlciksIHRjID0gcHJvdG9JbnQ2NC51RW5jKHZhbHVlKTtcbiAgICAgICAgdmlldy5zZXRJbnQzMigwLCB0Yy5sbywgdHJ1ZSk7XG4gICAgICAgIHZpZXcuc2V0SW50MzIoNCwgdGMuaGksIHRydWUpO1xuICAgICAgICByZXR1cm4gdGhpcy5yYXcoY2h1bmspO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBXcml0ZSBhIGBpbnQ2NGAgdmFsdWUsIGEgc2lnbmVkIDY0LWJpdCB2YXJpbnQuXG4gICAgICovXG4gICAgaW50NjQodmFsdWUpIHtcbiAgICAgICAgbGV0IHRjID0gcHJvdG9JbnQ2NC5lbmModmFsdWUpO1xuICAgICAgICB2YXJpbnQ2NHdyaXRlKHRjLmxvLCB0Yy5oaSwgdGhpcy5idWYpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gICAgLyoqXG4gICAgICogV3JpdGUgYSBgc2ludDY0YCB2YWx1ZSwgYSBzaWduZWQsIHppZy16YWctZW5jb2RlZCA2NC1iaXQgdmFyaW50LlxuICAgICAqL1xuICAgIHNpbnQ2NCh2YWx1ZSkge1xuICAgICAgICBjb25zdCB0YyA9IHByb3RvSW50NjQuZW5jKHZhbHVlKSwgXG4gICAgICAgIC8vIHppZ3phZyBlbmNvZGVcbiAgICAgICAgc2lnbiA9IHRjLmhpID4+IDMxLCBsbyA9ICh0Yy5sbyA8PCAxKSBeIHNpZ24sIGhpID0gKCh0Yy5oaSA8PCAxKSB8ICh0Yy5sbyA+Pj4gMzEpKSBeIHNpZ247XG4gICAgICAgIHZhcmludDY0d3JpdGUobG8sIGhpLCB0aGlzLmJ1Zik7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBXcml0ZSBhIGB1aW50NjRgIHZhbHVlLCBhbiB1bnNpZ25lZCA2NC1iaXQgdmFyaW50LlxuICAgICAqL1xuICAgIHVpbnQ2NCh2YWx1ZSkge1xuICAgICAgICBjb25zdCB0YyA9IHByb3RvSW50NjQudUVuYyh2YWx1ZSk7XG4gICAgICAgIHZhcmludDY0d3JpdGUodGMubG8sIHRjLmhpLCB0aGlzLmJ1Zik7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbn1cbmV4cG9ydCBjbGFzcyBCaW5hcnlSZWFkZXIge1xuICAgIGNvbnN0cnVjdG9yKGJ1ZiwgZGVjb2RlVXRmOCA9IGdldFRleHRFbmNvZGluZygpLmRlY29kZVV0ZjgpIHtcbiAgICAgICAgdGhpcy5kZWNvZGVVdGY4ID0gZGVjb2RlVXRmODtcbiAgICAgICAgdGhpcy52YXJpbnQ2NCA9IHZhcmludDY0cmVhZDsgLy8gZGlydHkgY2FzdCBmb3IgYHRoaXNgXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSZWFkIGEgYHVpbnQzMmAgZmllbGQsIGFuIHVuc2lnbmVkIDMyIGJpdCB2YXJpbnQuXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLnVpbnQzMiA9IHZhcmludDMycmVhZDtcbiAgICAgICAgdGhpcy5idWYgPSBidWY7XG4gICAgICAgIHRoaXMubGVuID0gYnVmLmxlbmd0aDtcbiAgICAgICAgdGhpcy5wb3MgPSAwO1xuICAgICAgICB0aGlzLnZpZXcgPSBuZXcgRGF0YVZpZXcoYnVmLmJ1ZmZlciwgYnVmLmJ5dGVPZmZzZXQsIGJ1Zi5ieXRlTGVuZ3RoKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVhZHMgYSB0YWcgLSBmaWVsZCBudW1iZXIgYW5kIHdpcmUgdHlwZS5cbiAgICAgKi9cbiAgICB0YWcoKSB7XG4gICAgICAgIGxldCB0YWcgPSB0aGlzLnVpbnQzMigpLCBmaWVsZE5vID0gdGFnID4+PiAzLCB3aXJlVHlwZSA9IHRhZyAmIDc7XG4gICAgICAgIGlmIChmaWVsZE5vIDw9IDAgfHwgd2lyZVR5cGUgPCAwIHx8IHdpcmVUeXBlID4gNSlcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImlsbGVnYWwgdGFnOiBmaWVsZCBubyBcIiArIGZpZWxkTm8gKyBcIiB3aXJlIHR5cGUgXCIgKyB3aXJlVHlwZSk7XG4gICAgICAgIHJldHVybiBbZmllbGRObywgd2lyZVR5cGVdO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBTa2lwIG9uZSBlbGVtZW50IGFuZCByZXR1cm4gdGhlIHNraXBwZWQgZGF0YS5cbiAgICAgKlxuICAgICAqIFdoZW4gc2tpcHBpbmcgU3RhcnRHcm91cCwgcHJvdmlkZSB0aGUgdGFncyBmaWVsZCBudW1iZXIgdG8gY2hlY2sgZm9yXG4gICAgICogbWF0Y2hpbmcgZmllbGQgbnVtYmVyIGluIHRoZSBFbmRHcm91cCB0YWcuXG4gICAgICovXG4gICAgc2tpcCh3aXJlVHlwZSwgZmllbGRObykge1xuICAgICAgICBsZXQgc3RhcnQgPSB0aGlzLnBvcztcbiAgICAgICAgc3dpdGNoICh3aXJlVHlwZSkge1xuICAgICAgICAgICAgY2FzZSBXaXJlVHlwZS5WYXJpbnQ6XG4gICAgICAgICAgICAgICAgd2hpbGUgKHRoaXMuYnVmW3RoaXMucG9zKytdICYgMHg4MCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBpZ25vcmVcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAvLyBAdHMtaWdub3JlIFRTNzAyOTogRmFsbHRocm91Z2ggY2FzZSBpbiBzd2l0Y2ggLS0gaWdub3JlIGluc3RlYWQgb2YgZXhwZWN0LWVycm9yIGZvciBjb21waWxlciBzZXR0aW5ncyB3aXRob3V0IG5vRmFsbHRocm91Z2hDYXNlc0luU3dpdGNoOiB0cnVlXG4gICAgICAgICAgICBjYXNlIFdpcmVUeXBlLkJpdDY0OlxuICAgICAgICAgICAgICAgIHRoaXMucG9zICs9IDQ7XG4gICAgICAgICAgICBjYXNlIFdpcmVUeXBlLkJpdDMyOlxuICAgICAgICAgICAgICAgIHRoaXMucG9zICs9IDQ7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFdpcmVUeXBlLkxlbmd0aERlbGltaXRlZDpcbiAgICAgICAgICAgICAgICBsZXQgbGVuID0gdGhpcy51aW50MzIoKTtcbiAgICAgICAgICAgICAgICB0aGlzLnBvcyArPSBsZW47XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFdpcmVUeXBlLlN0YXJ0R3JvdXA6XG4gICAgICAgICAgICAgICAgZm9yICg7Oykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBbZm4sIHd0XSA9IHRoaXMudGFnKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh3dCA9PT0gV2lyZVR5cGUuRW5kR3JvdXApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChmaWVsZE5vICE9PSB1bmRlZmluZWQgJiYgZm4gIT09IGZpZWxkTm8pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbnZhbGlkIGVuZCBncm91cCB0YWdcIik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNraXAod3QsIGZuKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImNhbnQgc2tpcCB3aXJlIHR5cGUgXCIgKyB3aXJlVHlwZSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hc3NlcnRCb3VuZHMoKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuYnVmLnN1YmFycmF5KHN0YXJ0LCB0aGlzLnBvcyk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFRocm93cyBlcnJvciBpZiBwb3NpdGlvbiBpbiBieXRlIGFycmF5IGlzIG91dCBvZiByYW5nZS5cbiAgICAgKi9cbiAgICBhc3NlcnRCb3VuZHMoKSB7XG4gICAgICAgIGlmICh0aGlzLnBvcyA+IHRoaXMubGVuKVxuICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoXCJwcmVtYXR1cmUgRU9GXCIpO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBSZWFkIGEgYGludDMyYCBmaWVsZCwgYSBzaWduZWQgMzIgYml0IHZhcmludC5cbiAgICAgKi9cbiAgICBpbnQzMigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudWludDMyKCkgfCAwO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBSZWFkIGEgYHNpbnQzMmAgZmllbGQsIGEgc2lnbmVkLCB6aWd6YWctZW5jb2RlZCAzMi1iaXQgdmFyaW50LlxuICAgICAqL1xuICAgIHNpbnQzMigpIHtcbiAgICAgICAgbGV0IHp6ZSA9IHRoaXMudWludDMyKCk7XG4gICAgICAgIC8vIGRlY29kZSB6aWd6YWdcbiAgICAgICAgcmV0dXJuICh6emUgPj4+IDEpIF4gLSh6emUgJiAxKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVhZCBhIGBpbnQ2NGAgZmllbGQsIGEgc2lnbmVkIDY0LWJpdCB2YXJpbnQuXG4gICAgICovXG4gICAgaW50NjQoKSB7XG4gICAgICAgIHJldHVybiBwcm90b0ludDY0LmRlYyguLi50aGlzLnZhcmludDY0KCkpO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBSZWFkIGEgYHVpbnQ2NGAgZmllbGQsIGFuIHVuc2lnbmVkIDY0LWJpdCB2YXJpbnQuXG4gICAgICovXG4gICAgdWludDY0KCkge1xuICAgICAgICByZXR1cm4gcHJvdG9JbnQ2NC51RGVjKC4uLnRoaXMudmFyaW50NjQoKSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFJlYWQgYSBgc2ludDY0YCBmaWVsZCwgYSBzaWduZWQsIHppZy16YWctZW5jb2RlZCA2NC1iaXQgdmFyaW50LlxuICAgICAqL1xuICAgIHNpbnQ2NCgpIHtcbiAgICAgICAgbGV0IFtsbywgaGldID0gdGhpcy52YXJpbnQ2NCgpO1xuICAgICAgICAvLyBkZWNvZGUgemlnIHphZ1xuICAgICAgICBsZXQgcyA9IC0obG8gJiAxKTtcbiAgICAgICAgbG8gPSAoKGxvID4+PiAxKSB8ICgoaGkgJiAxKSA8PCAzMSkpIF4gcztcbiAgICAgICAgaGkgPSAoaGkgPj4+IDEpIF4gcztcbiAgICAgICAgcmV0dXJuIHByb3RvSW50NjQuZGVjKGxvLCBoaSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFJlYWQgYSBgYm9vbGAgZmllbGQsIGEgdmFyaWFudC5cbiAgICAgKi9cbiAgICBib29sKCkge1xuICAgICAgICBsZXQgW2xvLCBoaV0gPSB0aGlzLnZhcmludDY0KCk7XG4gICAgICAgIHJldHVybiBsbyAhPT0gMCB8fCBoaSAhPT0gMDtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVhZCBhIGBmaXhlZDMyYCBmaWVsZCwgYW4gdW5zaWduZWQsIGZpeGVkLWxlbmd0aCAzMi1iaXQgaW50ZWdlci5cbiAgICAgKi9cbiAgICBmaXhlZDMyKCkge1xuICAgICAgICAvLyBiaW9tZS1pZ25vcmUgbGludC9zdXNwaWNpb3VzL25vQXNzaWduSW5FeHByZXNzaW9uczogbm9cbiAgICAgICAgcmV0dXJuIHRoaXMudmlldy5nZXRVaW50MzIoKHRoaXMucG9zICs9IDQpIC0gNCwgdHJ1ZSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFJlYWQgYSBgc2ZpeGVkMzJgIGZpZWxkLCBhIHNpZ25lZCwgZml4ZWQtbGVuZ3RoIDMyLWJpdCBpbnRlZ2VyLlxuICAgICAqL1xuICAgIHNmaXhlZDMyKCkge1xuICAgICAgICAvLyBiaW9tZS1pZ25vcmUgbGludC9zdXNwaWNpb3VzL25vQXNzaWduSW5FeHByZXNzaW9uczogbm9cbiAgICAgICAgcmV0dXJuIHRoaXMudmlldy5nZXRJbnQzMigodGhpcy5wb3MgKz0gNCkgLSA0LCB0cnVlKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVhZCBhIGBmaXhlZDY0YCBmaWVsZCwgYW4gdW5zaWduZWQsIGZpeGVkLWxlbmd0aCA2NCBiaXQgaW50ZWdlci5cbiAgICAgKi9cbiAgICBmaXhlZDY0KCkge1xuICAgICAgICByZXR1cm4gcHJvdG9JbnQ2NC51RGVjKHRoaXMuc2ZpeGVkMzIoKSwgdGhpcy5zZml4ZWQzMigpKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVhZCBhIGBmaXhlZDY0YCBmaWVsZCwgYSBzaWduZWQsIGZpeGVkLWxlbmd0aCA2NC1iaXQgaW50ZWdlci5cbiAgICAgKi9cbiAgICBzZml4ZWQ2NCgpIHtcbiAgICAgICAgcmV0dXJuIHByb3RvSW50NjQuZGVjKHRoaXMuc2ZpeGVkMzIoKSwgdGhpcy5zZml4ZWQzMigpKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVhZCBhIGBmbG9hdGAgZmllbGQsIDMyLWJpdCBmbG9hdGluZyBwb2ludCBudW1iZXIuXG4gICAgICovXG4gICAgZmxvYXQoKSB7XG4gICAgICAgIC8vIGJpb21lLWlnbm9yZSBsaW50L3N1c3BpY2lvdXMvbm9Bc3NpZ25JbkV4cHJlc3Npb25zOiBub1xuICAgICAgICByZXR1cm4gdGhpcy52aWV3LmdldEZsb2F0MzIoKHRoaXMucG9zICs9IDQpIC0gNCwgdHJ1ZSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIFJlYWQgYSBgZG91YmxlYCBmaWVsZCwgYSA2NC1iaXQgZmxvYXRpbmcgcG9pbnQgbnVtYmVyLlxuICAgICAqL1xuICAgIGRvdWJsZSgpIHtcbiAgICAgICAgLy8gYmlvbWUtaWdub3JlIGxpbnQvc3VzcGljaW91cy9ub0Fzc2lnbkluRXhwcmVzc2lvbnM6IG5vXG4gICAgICAgIHJldHVybiB0aGlzLnZpZXcuZ2V0RmxvYXQ2NCgodGhpcy5wb3MgKz0gOCkgLSA4LCB0cnVlKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogUmVhZCBhIGBieXRlc2AgZmllbGQsIGxlbmd0aC1kZWxpbWl0ZWQgYXJiaXRyYXJ5IGRhdGEuXG4gICAgICovXG4gICAgYnl0ZXMoKSB7XG4gICAgICAgIGxldCBsZW4gPSB0aGlzLnVpbnQzMigpLCBzdGFydCA9IHRoaXMucG9zO1xuICAgICAgICB0aGlzLnBvcyArPSBsZW47XG4gICAgICAgIHRoaXMuYXNzZXJ0Qm91bmRzKCk7XG4gICAgICAgIHJldHVybiB0aGlzLmJ1Zi5zdWJhcnJheShzdGFydCwgc3RhcnQgKyBsZW4pO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBSZWFkIGEgYHN0cmluZ2AgZmllbGQsIGxlbmd0aC1kZWxpbWl0ZWQgZGF0YSBjb252ZXJ0ZWQgdG8gVVRGLTggdGV4dC5cbiAgICAgKi9cbiAgICBzdHJpbmcoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmRlY29kZVV0ZjgodGhpcy5ieXRlcygpKTtcbiAgICB9XG59XG4vKipcbiAqIEFzc2VydCBhIHZhbGlkIHNpZ25lZCBwcm90b2J1ZiAzMi1iaXQgaW50ZWdlciBhcyBhIG51bWJlciBvciBzdHJpbmcuXG4gKi9cbmZ1bmN0aW9uIGFzc2VydEludDMyKGFyZykge1xuICAgIGlmICh0eXBlb2YgYXJnID09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgYXJnID0gTnVtYmVyKGFyZyk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGVvZiBhcmcgIT0gXCJudW1iZXJcIikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbnZhbGlkIGludDMyOiBcIiArIHR5cGVvZiBhcmcpO1xuICAgIH1cbiAgICBpZiAoIU51bWJlci5pc0ludGVnZXIoYXJnKSB8fFxuICAgICAgICBhcmcgPiBJTlQzMl9NQVggfHxcbiAgICAgICAgYXJnIDwgSU5UMzJfTUlOKVxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbnZhbGlkIGludDMyOiBcIiArIGFyZyk7XG59XG4vKipcbiAqIEFzc2VydCBhIHZhbGlkIHVuc2lnbmVkIHByb3RvYnVmIDMyLWJpdCBpbnRlZ2VyIGFzIGEgbnVtYmVyIG9yIHN0cmluZy5cbiAqL1xuZnVuY3Rpb24gYXNzZXJ0VUludDMyKGFyZykge1xuICAgIGlmICh0eXBlb2YgYXJnID09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgYXJnID0gTnVtYmVyKGFyZyk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGVvZiBhcmcgIT0gXCJudW1iZXJcIikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbnZhbGlkIHVpbnQzMjogXCIgKyB0eXBlb2YgYXJnKTtcbiAgICB9XG4gICAgaWYgKCFOdW1iZXIuaXNJbnRlZ2VyKGFyZykgfHxcbiAgICAgICAgYXJnID4gVUlOVDMyX01BWCB8fFxuICAgICAgICBhcmcgPCAwKVxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbnZhbGlkIHVpbnQzMjogXCIgKyBhcmcpO1xufVxuLyoqXG4gKiBBc3NlcnQgYSB2YWxpZCBwcm90b2J1ZiBmbG9hdCB2YWx1ZSBhcyBhIG51bWJlciBvciBzdHJpbmcuXG4gKi9cbmZ1bmN0aW9uIGFzc2VydEZsb2F0MzIoYXJnKSB7XG4gICAgaWYgKHR5cGVvZiBhcmcgPT0gXCJzdHJpbmdcIikge1xuICAgICAgICBjb25zdCBvID0gYXJnO1xuICAgICAgICBhcmcgPSBOdW1iZXIoYXJnKTtcbiAgICAgICAgaWYgKE51bWJlci5pc05hTihhcmcpICYmIG8gIT09IFwiTmFOXCIpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImludmFsaWQgZmxvYXQzMjogXCIgKyBvKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlb2YgYXJnICE9IFwibnVtYmVyXCIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiaW52YWxpZCBmbG9hdDMyOiBcIiArIHR5cGVvZiBhcmcpO1xuICAgIH1cbiAgICBpZiAoTnVtYmVyLmlzRmluaXRlKGFyZykgJiZcbiAgICAgICAgKGFyZyA+IEZMT0FUMzJfTUFYIHx8IGFyZyA8IEZMT0FUMzJfTUlOKSlcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiaW52YWxpZCBmbG9hdDMyOiBcIiArIGFyZyk7XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbmltcG9ydCB7IFNjYWxhclR5cGUsIH0gZnJvbSBcIi4uL2Rlc2NyaXB0b3JzLmpzXCI7XG5pbXBvcnQgeyBpc01lc3NhZ2UgfSBmcm9tIFwiLi4vaXMtbWVzc2FnZS5qc1wiO1xuaW1wb3J0IHsgRmllbGRFcnJvciB9IGZyb20gXCIuL2Vycm9yLmpzXCI7XG5pbXBvcnQgeyBpc1JlZmxlY3RMaXN0LCBpc1JlZmxlY3RNYXAsIGlzUmVmbGVjdE1lc3NhZ2UgfSBmcm9tIFwiLi9ndWFyZC5qc1wiO1xuaW1wb3J0IHsgRkxPQVQzMl9NQVgsIEZMT0FUMzJfTUlOLCBJTlQzMl9NQVgsIElOVDMyX01JTiwgVUlOVDMyX01BWCwgfSBmcm9tIFwiLi4vd2lyZS9iaW5hcnktZW5jb2RpbmcuanNcIjtcbmltcG9ydCB7IGdldFRleHRFbmNvZGluZyB9IGZyb20gXCIuLi93aXJlL3RleHQtZW5jb2RpbmcuanNcIjtcbmltcG9ydCB7IHByb3RvSW50NjQgfSBmcm9tIFwiLi4vcHJvdG8taW50NjQuanNcIjtcbi8qKlxuICogQ2hlY2sgd2hldGhlciB0aGUgZ2l2ZW4gZmllbGQgdmFsdWUgaXMgdmFsaWQgZm9yIHRoZSByZWZsZWN0IEFQSS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNoZWNrRmllbGQoZmllbGQsIHZhbHVlKSB7XG4gICAgY29uc3QgY2hlY2sgPSBmaWVsZC5maWVsZEtpbmQgPT0gXCJsaXN0XCJcbiAgICAgICAgPyBpc1JlZmxlY3RMaXN0KHZhbHVlLCBmaWVsZClcbiAgICAgICAgOiBmaWVsZC5maWVsZEtpbmQgPT0gXCJtYXBcIlxuICAgICAgICAgICAgPyBpc1JlZmxlY3RNYXAodmFsdWUsIGZpZWxkKVxuICAgICAgICAgICAgOiBjaGVja1Npbmd1bGFyKGZpZWxkLCB2YWx1ZSk7XG4gICAgaWYgKGNoZWNrID09PSB0cnVlKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGxldCByZWFzb247XG4gICAgc3dpdGNoIChmaWVsZC5maWVsZEtpbmQpIHtcbiAgICAgICAgY2FzZSBcImxpc3RcIjpcbiAgICAgICAgICAgIHJlYXNvbiA9IGBleHBlY3RlZCAke2Zvcm1hdFJlZmxlY3RMaXN0KGZpZWxkKX0sIGdvdCAke2Zvcm1hdFZhbCh2YWx1ZSl9YDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwibWFwXCI6XG4gICAgICAgICAgICByZWFzb24gPSBgZXhwZWN0ZWQgJHtmb3JtYXRSZWZsZWN0TWFwKGZpZWxkKX0sIGdvdCAke2Zvcm1hdFZhbCh2YWx1ZSl9YDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OiB7XG4gICAgICAgICAgICByZWFzb24gPSByZWFzb25TaW5ndWxhcihmaWVsZCwgdmFsdWUsIGNoZWNrKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbmV3IEZpZWxkRXJyb3IoZmllbGQsIHJlYXNvbik7XG59XG4vKipcbiAqIENoZWNrIHdoZXRoZXIgdGhlIGdpdmVuIGxpc3QgaXRlbSBpcyB2YWxpZCBmb3IgdGhlIHJlZmxlY3QgQVBJLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2hlY2tMaXN0SXRlbShmaWVsZCwgaW5kZXgsIHZhbHVlKSB7XG4gICAgY29uc3QgY2hlY2sgPSBjaGVja1Npbmd1bGFyKGZpZWxkLCB2YWx1ZSk7XG4gICAgaWYgKGNoZWNrICE9PSB0cnVlKSB7XG4gICAgICAgIHJldHVybiBuZXcgRmllbGRFcnJvcihmaWVsZCwgYGxpc3QgaXRlbSAjJHtpbmRleCArIDF9OiAke3JlYXNvblNpbmd1bGFyKGZpZWxkLCB2YWx1ZSwgY2hlY2spfWApO1xuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xufVxuLyoqXG4gKiBDaGVjayB3aGV0aGVyIHRoZSBnaXZlbiBtYXAga2V5IGFuZCB2YWx1ZSBhcmUgdmFsaWQgZm9yIHRoZSByZWZsZWN0IEFQSS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNoZWNrTWFwRW50cnkoZmllbGQsIGtleSwgdmFsdWUpIHtcbiAgICBjb25zdCBjaGVja0tleSA9IGNoZWNrU2NhbGFyVmFsdWUoa2V5LCBmaWVsZC5tYXBLZXkpO1xuICAgIGlmIChjaGVja0tleSAhPT0gdHJ1ZSkge1xuICAgICAgICByZXR1cm4gbmV3IEZpZWxkRXJyb3IoZmllbGQsIGBpbnZhbGlkIG1hcCBrZXk6ICR7cmVhc29uU2luZ3VsYXIoeyBzY2FsYXI6IGZpZWxkLm1hcEtleSB9LCBrZXksIGNoZWNrS2V5KX1gKTtcbiAgICB9XG4gICAgY29uc3QgY2hlY2tWYWwgPSBjaGVja1Npbmd1bGFyKGZpZWxkLCB2YWx1ZSk7XG4gICAgaWYgKGNoZWNrVmFsICE9PSB0cnVlKSB7XG4gICAgICAgIHJldHVybiBuZXcgRmllbGRFcnJvcihmaWVsZCwgYG1hcCBlbnRyeSAke2Zvcm1hdFZhbChrZXkpfTogJHtyZWFzb25TaW5ndWxhcihmaWVsZCwgdmFsdWUsIGNoZWNrVmFsKX1gKTtcbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cbmZ1bmN0aW9uIGNoZWNrU2luZ3VsYXIoZmllbGQsIHZhbHVlKSB7XG4gICAgaWYgKGZpZWxkLnNjYWxhciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHJldHVybiBjaGVja1NjYWxhclZhbHVlKHZhbHVlLCBmaWVsZC5zY2FsYXIpO1xuICAgIH1cbiAgICBpZiAoZmllbGQuZW51bSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGlmIChmaWVsZC5lbnVtLm9wZW4pIHtcbiAgICAgICAgICAgIHJldHVybiBOdW1iZXIuaXNJbnRlZ2VyKHZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmllbGQuZW51bS52YWx1ZXMuc29tZSgodikgPT4gdi5udW1iZXIgPT09IHZhbHVlKTtcbiAgICB9XG4gICAgcmV0dXJuIGlzUmVmbGVjdE1lc3NhZ2UodmFsdWUsIGZpZWxkLm1lc3NhZ2UpO1xufVxuZnVuY3Rpb24gY2hlY2tTY2FsYXJWYWx1ZSh2YWx1ZSwgc2NhbGFyKSB7XG4gICAgc3dpdGNoIChzY2FsYXIpIHtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkRPVUJMRTpcbiAgICAgICAgICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT0gXCJudW1iZXJcIjtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZMT0FUOlxuICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPSBcIm51bWJlclwiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKE51bWJlci5pc05hTih2YWx1ZSkgfHwgIU51bWJlci5pc0Zpbml0ZSh2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWx1ZSA+IEZMT0FUMzJfTUFYIHx8IHZhbHVlIDwgRkxPQVQzMl9NSU4pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYCR7dmFsdWUudG9GaXhlZCgpfSBvdXQgb2YgcmFuZ2VgO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5JTlQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNGSVhFRDMyOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0lOVDMyOlxuICAgICAgICAgICAgLy8gc2lnbmVkXG4gICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlICE9PSBcIm51bWJlclwiIHx8ICFOdW1iZXIuaXNJbnRlZ2VyKHZhbHVlKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWx1ZSA+IElOVDMyX01BWCB8fCB2YWx1ZSA8IElOVDMyX01JTikge1xuICAgICAgICAgICAgICAgIHJldHVybiBgJHt2YWx1ZS50b0ZpeGVkKCl9IG91dCBvZiByYW5nZWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZJWEVEMzI6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5VSU5UMzI6XG4gICAgICAgICAgICAvLyB1bnNpZ25lZFxuICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJudW1iZXJcIiB8fCAhTnVtYmVyLmlzSW50ZWdlcih2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUgPiBVSU5UMzJfTUFYIHx8IHZhbHVlIDwgMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBgJHt2YWx1ZS50b0ZpeGVkKCl9IG91dCBvZiByYW5nZWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkJPT0w6XG4gICAgICAgICAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09IFwiYm9vbGVhblwiO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU1RSSU5HOlxuICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGdldFRleHRFbmNvZGluZygpLmNoZWNrVXRmOCh2YWx1ZSkgfHwgXCJpbnZhbGlkIFVURjhcIjtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkJZVEVTOlxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlIGluc3RhbmNlb2YgVWludDhBcnJheTtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLklOVDY0OlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0ZJWEVENjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TSU5UNjQ6XG4gICAgICAgICAgICAvLyBzaWduZWRcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT0gXCJiaWdpbnRcIiB8fFxuICAgICAgICAgICAgICAgIHR5cGVvZiB2YWx1ZSA9PSBcIm51bWJlclwiIHx8XG4gICAgICAgICAgICAgICAgKHR5cGVvZiB2YWx1ZSA9PSBcInN0cmluZ1wiICYmIHZhbHVlLmxlbmd0aCA+IDApKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgcHJvdG9JbnQ2NC5wYXJzZSh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXRjaCAoXykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYCR7dmFsdWV9IG91dCBvZiByYW5nZWA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRklYRUQ2NDpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlVJTlQ2NDpcbiAgICAgICAgICAgIC8vIHVuc2lnbmVkXG4gICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09IFwiYmlnaW50XCIgfHxcbiAgICAgICAgICAgICAgICB0eXBlb2YgdmFsdWUgPT0gXCJudW1iZXJcIiB8fFxuICAgICAgICAgICAgICAgICh0eXBlb2YgdmFsdWUgPT0gXCJzdHJpbmdcIiAmJiB2YWx1ZS5sZW5ndGggPiAwKSkge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHByb3RvSW50NjQudVBhcnNlKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhdGNoIChfKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBgJHt2YWx1ZX0gb3V0IG9mIHJhbmdlYDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxufVxuZnVuY3Rpb24gcmVhc29uU2luZ3VsYXIoZmllbGQsIHZhbCwgZGV0YWlscykge1xuICAgIGRldGFpbHMgPVxuICAgICAgICB0eXBlb2YgZGV0YWlscyA9PSBcInN0cmluZ1wiID8gYDogJHtkZXRhaWxzfWAgOiBgLCBnb3QgJHtmb3JtYXRWYWwodmFsKX1gO1xuICAgIGlmIChmaWVsZC5zY2FsYXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gYGV4cGVjdGVkICR7c2NhbGFyVHlwZURlc2NyaXB0aW9uKGZpZWxkLnNjYWxhcil9YCArIGRldGFpbHM7XG4gICAgfVxuICAgIGlmIChmaWVsZC5lbnVtICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIGBleHBlY3RlZCAke2ZpZWxkLmVudW0udG9TdHJpbmcoKX1gICsgZGV0YWlscztcbiAgICB9XG4gICAgcmV0dXJuIGBleHBlY3RlZCAke2Zvcm1hdFJlZmxlY3RNZXNzYWdlKGZpZWxkLm1lc3NhZ2UpfWAgKyBkZXRhaWxzO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdFZhbCh2YWwpIHtcbiAgICBzd2l0Y2ggKHR5cGVvZiB2YWwpIHtcbiAgICAgICAgY2FzZSBcIm9iamVjdFwiOlxuICAgICAgICAgICAgaWYgKHZhbCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBcIm51bGxcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWwgaW5zdGFuY2VvZiBVaW50OEFycmF5KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGBVaW50OEFycmF5KCR7dmFsLmxlbmd0aH0pYDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHZhbCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYEFycmF5KCR7dmFsLmxlbmd0aH0pYDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpc1JlZmxlY3RMaXN0KHZhbCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZm9ybWF0UmVmbGVjdExpc3QodmFsLmZpZWxkKCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGlzUmVmbGVjdE1hcCh2YWwpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZvcm1hdFJlZmxlY3RNYXAodmFsLmZpZWxkKCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGlzUmVmbGVjdE1lc3NhZ2UodmFsKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmb3JtYXRSZWZsZWN0TWVzc2FnZSh2YWwuZGVzYyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaXNNZXNzYWdlKHZhbCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYG1lc3NhZ2UgJHt2YWwuJHR5cGVOYW1lfWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gXCJvYmplY3RcIjtcbiAgICAgICAgY2FzZSBcInN0cmluZ1wiOlxuICAgICAgICAgICAgcmV0dXJuIHZhbC5sZW5ndGggPiAzMCA/IFwic3RyaW5nXCIgOiBgXCIke3ZhbC5zcGxpdCgnXCInKS5qb2luKCdcXFxcXCInKX1cImA7XG4gICAgICAgIGNhc2UgXCJib29sZWFuXCI6XG4gICAgICAgICAgICByZXR1cm4gU3RyaW5nKHZhbCk7XG4gICAgICAgIGNhc2UgXCJudW1iZXJcIjpcbiAgICAgICAgICAgIHJldHVybiBTdHJpbmcodmFsKTtcbiAgICAgICAgY2FzZSBcImJpZ2ludFwiOlxuICAgICAgICAgICAgcmV0dXJuIFN0cmluZyh2YWwpICsgXCJuXCI7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAvLyBcInN5bWJvbFwiIHwgXCJ1bmRlZmluZWRcIiB8IFwib2JqZWN0XCIgfCBcImZ1bmN0aW9uXCJcbiAgICAgICAgICAgIHJldHVybiB0eXBlb2YgdmFsO1xuICAgIH1cbn1cbmZ1bmN0aW9uIGZvcm1hdFJlZmxlY3RNZXNzYWdlKGRlc2MpIHtcbiAgICByZXR1cm4gYFJlZmxlY3RNZXNzYWdlICgke2Rlc2MudHlwZU5hbWV9KWA7XG59XG5mdW5jdGlvbiBmb3JtYXRSZWZsZWN0TGlzdChmaWVsZCkge1xuICAgIHN3aXRjaCAoZmllbGQubGlzdEtpbmQpIHtcbiAgICAgICAgY2FzZSBcIm1lc3NhZ2VcIjpcbiAgICAgICAgICAgIHJldHVybiBgUmVmbGVjdExpc3QgKCR7ZmllbGQubWVzc2FnZS50b1N0cmluZygpfSlgO1xuICAgICAgICBjYXNlIFwiZW51bVwiOlxuICAgICAgICAgICAgcmV0dXJuIGBSZWZsZWN0TGlzdCAoJHtmaWVsZC5lbnVtLnRvU3RyaW5nKCl9KWA7XG4gICAgICAgIGNhc2UgXCJzY2FsYXJcIjpcbiAgICAgICAgICAgIHJldHVybiBgUmVmbGVjdExpc3QgKCR7U2NhbGFyVHlwZVtmaWVsZC5zY2FsYXJdfSlgO1xuICAgIH1cbn1cbmZ1bmN0aW9uIGZvcm1hdFJlZmxlY3RNYXAoZmllbGQpIHtcbiAgICBzd2l0Y2ggKGZpZWxkLm1hcEtpbmQpIHtcbiAgICAgICAgY2FzZSBcIm1lc3NhZ2VcIjpcbiAgICAgICAgICAgIHJldHVybiBgUmVmbGVjdE1hcCAoJHtTY2FsYXJUeXBlW2ZpZWxkLm1hcEtleV19LCAke2ZpZWxkLm1lc3NhZ2UudG9TdHJpbmcoKX0pYDtcbiAgICAgICAgY2FzZSBcImVudW1cIjpcbiAgICAgICAgICAgIHJldHVybiBgUmVmbGVjdE1hcCAoJHtTY2FsYXJUeXBlW2ZpZWxkLm1hcEtleV19LCAke2ZpZWxkLmVudW0udG9TdHJpbmcoKX0pYDtcbiAgICAgICAgY2FzZSBcInNjYWxhclwiOlxuICAgICAgICAgICAgcmV0dXJuIGBSZWZsZWN0TWFwICgke1NjYWxhclR5cGVbZmllbGQubWFwS2V5XX0sICR7U2NhbGFyVHlwZVtmaWVsZC5zY2FsYXJdfSlgO1xuICAgIH1cbn1cbmZ1bmN0aW9uIHNjYWxhclR5cGVEZXNjcmlwdGlvbihzY2FsYXIpIHtcbiAgICBzd2l0Y2ggKHNjYWxhcikge1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU1RSSU5HOlxuICAgICAgICAgICAgcmV0dXJuIFwic3RyaW5nXCI7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5CT09MOlxuICAgICAgICAgICAgcmV0dXJuIFwiYm9vbGVhblwiO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuSU5UNjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TSU5UNjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TRklYRUQ2NDpcbiAgICAgICAgICAgIHJldHVybiBcImJpZ2ludCAoaW50NjQpXCI7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5VSU5UNjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5GSVhFRDY0OlxuICAgICAgICAgICAgcmV0dXJuIFwiYmlnaW50ICh1aW50NjQpXCI7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5CWVRFUzpcbiAgICAgICAgICAgIHJldHVybiBcIlVpbnQ4QXJyYXlcIjtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkRPVUJMRTpcbiAgICAgICAgICAgIHJldHVybiBcIm51bWJlciAoZmxvYXQ2NClcIjtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZMT0FUOlxuICAgICAgICAgICAgcmV0dXJuIFwibnVtYmVyIChmbG9hdDMyKVwiO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRklYRUQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlVJTlQzMjpcbiAgICAgICAgICAgIHJldHVybiBcIm51bWJlciAodWludDMyKVwiO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuSU5UMzI6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TRklYRUQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNJTlQzMjpcbiAgICAgICAgICAgIHJldHVybiBcIm51bWJlciAoaW50MzIpXCI7XG4gICAgfVxufVxuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5leHBvcnQgZnVuY3Rpb24gaXNXcmFwcGVyKGFyZykge1xuICAgIHJldHVybiBpc1dyYXBwZXJUeXBlTmFtZShhcmcuJHR5cGVOYW1lKTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBpc1dyYXBwZXJEZXNjKG1lc3NhZ2VEZXNjKSB7XG4gICAgY29uc3QgZiA9IG1lc3NhZ2VEZXNjLmZpZWxkc1swXTtcbiAgICByZXR1cm4gKGlzV3JhcHBlclR5cGVOYW1lKG1lc3NhZ2VEZXNjLnR5cGVOYW1lKSAmJlxuICAgICAgICBmICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgZi5maWVsZEtpbmQgPT0gXCJzY2FsYXJcIiAmJlxuICAgICAgICBmLm5hbWUgPT0gXCJ2YWx1ZVwiICYmXG4gICAgICAgIGYubnVtYmVyID09IDEpO1xufVxuZnVuY3Rpb24gaXNXcmFwcGVyVHlwZU5hbWUobmFtZSkge1xuICAgIHJldHVybiAobmFtZS5zdGFydHNXaXRoKFwiZ29vZ2xlLnByb3RvYnVmLlwiKSAmJlxuICAgICAgICBbXG4gICAgICAgICAgICBcIkRvdWJsZVZhbHVlXCIsXG4gICAgICAgICAgICBcIkZsb2F0VmFsdWVcIixcbiAgICAgICAgICAgIFwiSW50NjRWYWx1ZVwiLFxuICAgICAgICAgICAgXCJVSW50NjRWYWx1ZVwiLFxuICAgICAgICAgICAgXCJJbnQzMlZhbHVlXCIsXG4gICAgICAgICAgICBcIlVJbnQzMlZhbHVlXCIsXG4gICAgICAgICAgICBcIkJvb2xWYWx1ZVwiLFxuICAgICAgICAgICAgXCJTdHJpbmdWYWx1ZVwiLFxuICAgICAgICAgICAgXCJCeXRlc1ZhbHVlXCIsXG4gICAgICAgIF0uaW5jbHVkZXMobmFtZS5zdWJzdHJpbmcoMTYpKSk7XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbmltcG9ydCB7IGlzTWVzc2FnZSB9IGZyb20gXCIuL2lzLW1lc3NhZ2UuanNcIjtcbmltcG9ydCB7IFNjYWxhclR5cGUsIH0gZnJvbSBcIi4vZGVzY3JpcHRvcnMuanNcIjtcbmltcG9ydCB7IHNjYWxhclplcm9WYWx1ZSB9IGZyb20gXCIuL3JlZmxlY3Qvc2NhbGFyLmpzXCI7XG5pbXBvcnQgeyBpc09iamVjdCB9IGZyb20gXCIuL3JlZmxlY3QvZ3VhcmQuanNcIjtcbmltcG9ydCB7IHVuc2FmZUdldCwgdW5zYWZlT25lb2ZDYXNlLCB1bnNhZmVTZXQgfSBmcm9tIFwiLi9yZWZsZWN0L3Vuc2FmZS5qc1wiO1xuaW1wb3J0IHsgaXNXcmFwcGVyRGVzYyB9IGZyb20gXCIuL3drdC93cmFwcGVycy5qc1wiO1xuLy8gYm9vdHN0cmFwLWluamVjdCBnb29nbGUucHJvdG9idWYuRWRpdGlvbi5FRElUSU9OX1BST1RPMzogY29uc3QgJG5hbWU6IEVkaXRpb24uJGxvY2FsTmFtZSA9ICRudW1iZXI7XG5jb25zdCBFRElUSU9OX1BST1RPMyA9IDk5OTtcbi8vIGJvb3RzdHJhcC1pbmplY3QgZ29vZ2xlLnByb3RvYnVmLkVkaXRpb24uRURJVElPTl9QUk9UTzI6IGNvbnN0ICRuYW1lOiBFZGl0aW9uLiRsb2NhbE5hbWUgPSAkbnVtYmVyO1xuY29uc3QgRURJVElPTl9QUk9UTzIgPSA5OTg7XG4vLyBib290c3RyYXAtaW5qZWN0IGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LkZpZWxkUHJlc2VuY2UuSU1QTElDSVQ6IGNvbnN0ICRuYW1lOiBGZWF0dXJlU2V0X0ZpZWxkUHJlc2VuY2UuJGxvY2FsTmFtZSA9ICRudW1iZXI7XG5jb25zdCBJTVBMSUNJVCA9IDI7XG4vKipcbiAqIENyZWF0ZSBhIG5ldyBtZXNzYWdlIGluc3RhbmNlLlxuICpcbiAqIFRoZSBzZWNvbmQgYXJndW1lbnQgaXMgYW4gb3B0aW9uYWwgaW5pdGlhbGl6ZXIgb2JqZWN0LCB3aGVyZSBhbGwgZmllbGRzIGFyZVxuICogb3B0aW9uYWwuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGUoc2NoZW1hLCBpbml0KSB7XG4gICAgaWYgKGlzTWVzc2FnZShpbml0LCBzY2hlbWEpKSB7XG4gICAgICAgIHJldHVybiBpbml0O1xuICAgIH1cbiAgICBjb25zdCBtZXNzYWdlID0gY3JlYXRlWmVyb01lc3NhZ2Uoc2NoZW1hKTtcbiAgICBpZiAoaW5pdCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGluaXRNZXNzYWdlKHNjaGVtYSwgbWVzc2FnZSwgaW5pdCk7XG4gICAgfVxuICAgIHJldHVybiBtZXNzYWdlO1xufVxuLyoqXG4gKiBTZXRzIGZpZWxkIHZhbHVlcyBmcm9tIGEgTWVzc2FnZUluaXRTaGFwZSBvbiBhIHplcm8gbWVzc2FnZS5cbiAqL1xuZnVuY3Rpb24gaW5pdE1lc3NhZ2UobWVzc2FnZURlc2MsIG1lc3NhZ2UsIGluaXQpIHtcbiAgICBmb3IgKGNvbnN0IG1lbWJlciBvZiBtZXNzYWdlRGVzYy5tZW1iZXJzKSB7XG4gICAgICAgIGxldCB2YWx1ZSA9IGluaXRbbWVtYmVyLmxvY2FsTmFtZV07XG4gICAgICAgIGlmICh2YWx1ZSA9PSBudWxsKSB7XG4gICAgICAgICAgICAvLyBpbnRlbnRpb25hbGx5IGlnbm9yZSB1bmRlZmluZWQgYW5kIG51bGxcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGxldCBmaWVsZDtcbiAgICAgICAgaWYgKG1lbWJlci5raW5kID09IFwib25lb2ZcIikge1xuICAgICAgICAgICAgY29uc3Qgb25lb2ZGaWVsZCA9IHVuc2FmZU9uZW9mQ2FzZShpbml0LCBtZW1iZXIpO1xuICAgICAgICAgICAgaWYgKCFvbmVvZkZpZWxkKSB7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmaWVsZCA9IG9uZW9mRmllbGQ7XG4gICAgICAgICAgICB2YWx1ZSA9IHVuc2FmZUdldChpbml0LCBvbmVvZkZpZWxkKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGZpZWxkID0gbWVtYmVyO1xuICAgICAgICB9XG4gICAgICAgIHN3aXRjaCAoZmllbGQuZmllbGRLaW5kKSB7XG4gICAgICAgICAgICBjYXNlIFwibWVzc2FnZVwiOlxuICAgICAgICAgICAgICAgIHZhbHVlID0gdG9NZXNzYWdlKGZpZWxkLCB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwic2NhbGFyXCI6XG4gICAgICAgICAgICAgICAgdmFsdWUgPSBpbml0U2NhbGFyKGZpZWxkLCB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwibGlzdFwiOlxuICAgICAgICAgICAgICAgIHZhbHVlID0gaW5pdExpc3QoZmllbGQsIHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJtYXBcIjpcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IGluaXRNYXAoZmllbGQsIHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICB1bnNhZmVTZXQobWVzc2FnZSwgZmllbGQsIHZhbHVlKTtcbiAgICB9XG4gICAgcmV0dXJuIG1lc3NhZ2U7XG59XG5mdW5jdGlvbiBpbml0U2NhbGFyKGZpZWxkLCB2YWx1ZSkge1xuICAgIGlmIChmaWVsZC5zY2FsYXIgPT0gU2NhbGFyVHlwZS5CWVRFUykge1xuICAgICAgICByZXR1cm4gdG9VOEFycih2YWx1ZSk7XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZTtcbn1cbmZ1bmN0aW9uIGluaXRNYXAoZmllbGQsIHZhbHVlKSB7XG4gICAgaWYgKGlzT2JqZWN0KHZhbHVlKSkge1xuICAgICAgICBpZiAoZmllbGQuc2NhbGFyID09IFNjYWxhclR5cGUuQllURVMpIHtcbiAgICAgICAgICAgIHJldHVybiBjb252ZXJ0T2JqZWN0VmFsdWVzKHZhbHVlLCB0b1U4QXJyKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZmllbGQubWFwS2luZCA9PSBcIm1lc3NhZ2VcIikge1xuICAgICAgICAgICAgcmV0dXJuIGNvbnZlcnRPYmplY3RWYWx1ZXModmFsdWUsICh2YWwpID0+IHRvTWVzc2FnZShmaWVsZCwgdmFsKSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlO1xufVxuZnVuY3Rpb24gaW5pdExpc3QoZmllbGQsIHZhbHVlKSB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICAgIGlmIChmaWVsZC5zY2FsYXIgPT0gU2NhbGFyVHlwZS5CWVRFUykge1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlLm1hcCh0b1U4QXJyKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZmllbGQubGlzdEtpbmQgPT0gXCJtZXNzYWdlXCIpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZS5tYXAoKGl0ZW0pID0+IHRvTWVzc2FnZShmaWVsZCwgaXRlbSkpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZTtcbn1cbmZ1bmN0aW9uIHRvTWVzc2FnZShmaWVsZCwgdmFsdWUpIHtcbiAgICBpZiAoZmllbGQuZmllbGRLaW5kID09IFwibWVzc2FnZVwiICYmXG4gICAgICAgICFmaWVsZC5vbmVvZiAmJlxuICAgICAgICBpc1dyYXBwZXJEZXNjKGZpZWxkLm1lc3NhZ2UpKSB7XG4gICAgICAgIC8vIFR5cGVzIGZyb20gZ29vZ2xlL3Byb3RvYnVmL3dyYXBwZXJzLnByb3RvIGFyZSB1bndyYXBwZWQgd2hlbiB1c2VkIGluXG4gICAgICAgIC8vIGEgc2luZ3VsYXIgZmllbGQgdGhhdCBpcyBub3QgcGFydCBvZiBhIG9uZW9mIGdyb3VwLlxuICAgICAgICByZXR1cm4gaW5pdFNjYWxhcihmaWVsZC5tZXNzYWdlLmZpZWxkc1swXSwgdmFsdWUpO1xuICAgIH1cbiAgICBpZiAoaXNPYmplY3QodmFsdWUpKSB7XG4gICAgICAgIGlmIChmaWVsZC5tZXNzYWdlLnR5cGVOYW1lID09IFwiZ29vZ2xlLnByb3RvYnVmLlN0cnVjdFwiICYmXG4gICAgICAgICAgICBmaWVsZC5wYXJlbnQudHlwZU5hbWUgIT09IFwiZ29vZ2xlLnByb3RvYnVmLlZhbHVlXCIpIHtcbiAgICAgICAgICAgIC8vIGdvb2dsZS5wcm90b2J1Zi5TdHJ1Y3QgaXMgcmVwcmVzZW50ZWQgd2l0aCBKc29uT2JqZWN0IHdoZW4gdXNlZCBpbiBhXG4gICAgICAgICAgICAvLyBmaWVsZCwgZXhjZXB0IHdoZW4gdXNlZCBpbiBnb29nbGUucHJvdG9idWYuVmFsdWUuXG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFpc01lc3NhZ2UodmFsdWUsIGZpZWxkLm1lc3NhZ2UpKSB7XG4gICAgICAgICAgICByZXR1cm4gY3JlYXRlKGZpZWxkLm1lc3NhZ2UsIHZhbHVlKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdmFsdWU7XG59XG4vLyBjb252ZXJ0cyBhbnkgQXJyYXlMaWtlPG51bWJlcj4gdG8gVWludDhBcnJheSBpZiBuZWNlc3NhcnkuXG5mdW5jdGlvbiB0b1U4QXJyKHZhbHVlKSB7XG4gICAgcmV0dXJuIEFycmF5LmlzQXJyYXkodmFsdWUpID8gbmV3IFVpbnQ4QXJyYXkodmFsdWUpIDogdmFsdWU7XG59XG5mdW5jdGlvbiBjb252ZXJ0T2JqZWN0VmFsdWVzKG9iaiwgZm4pIHtcbiAgICBjb25zdCByZXQgPSB7fTtcbiAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIE9iamVjdC5lbnRyaWVzKG9iaikpIHtcbiAgICAgICAgcmV0W2VudHJ5WzBdXSA9IGZuKGVudHJ5WzFdKTtcbiAgICB9XG4gICAgcmV0dXJuIHJldDtcbn1cbmNvbnN0IHRva2VuWmVyb01lc3NhZ2VGaWVsZCA9IFN5bWJvbCgpO1xuY29uc3QgbWVzc2FnZVByb3RvdHlwZXMgPSBuZXcgV2Vha01hcCgpO1xuLyoqXG4gKiBDcmVhdGUgYSB6ZXJvIG1lc3NhZ2UuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZVplcm9NZXNzYWdlKGRlc2MpIHtcbiAgICBsZXQgbXNnO1xuICAgIGlmICghbmVlZHNQcm90b3R5cGVDaGFpbihkZXNjKSkge1xuICAgICAgICBtc2cgPSB7XG4gICAgICAgICAgICAkdHlwZU5hbWU6IGRlc2MudHlwZU5hbWUsXG4gICAgICAgIH07XG4gICAgICAgIGZvciAoY29uc3QgbWVtYmVyIG9mIGRlc2MubWVtYmVycykge1xuICAgICAgICAgICAgaWYgKG1lbWJlci5raW5kID09IFwib25lb2ZcIiB8fCBtZW1iZXIucHJlc2VuY2UgPT0gSU1QTElDSVQpIHtcbiAgICAgICAgICAgICAgICBtc2dbbWVtYmVyLmxvY2FsTmFtZV0gPSBjcmVhdGVaZXJvRmllbGQobWVtYmVyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgLy8gU3VwcG9ydCBkZWZhdWx0IHZhbHVlcyBhbmQgdHJhY2sgcHJlc2VuY2UgdmlhIHRoZSBwcm90b3R5cGUgY2hhaW5cbiAgICAgICAgY29uc3QgY2FjaGVkID0gbWVzc2FnZVByb3RvdHlwZXMuZ2V0KGRlc2MpO1xuICAgICAgICBsZXQgcHJvdG90eXBlO1xuICAgICAgICBsZXQgbWVtYmVycztcbiAgICAgICAgaWYgKGNhY2hlZCkge1xuICAgICAgICAgICAgKHsgcHJvdG90eXBlLCBtZW1iZXJzIH0gPSBjYWNoZWQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcHJvdG90eXBlID0ge307XG4gICAgICAgICAgICBtZW1iZXJzID0gbmV3IFNldCgpO1xuICAgICAgICAgICAgZm9yIChjb25zdCBtZW1iZXIgb2YgZGVzYy5tZW1iZXJzKSB7XG4gICAgICAgICAgICAgICAgaWYgKG1lbWJlci5raW5kID09IFwib25lb2ZcIikge1xuICAgICAgICAgICAgICAgICAgICAvLyB3ZSBjYW4gb25seSBwdXQgaW1tdXRhYmxlIHZhbHVlcyBvbiB0aGUgcHJvdG90eXBlLFxuICAgICAgICAgICAgICAgICAgICAvLyBvbmVvZiBBRFRzIGFyZSBtdXRhYmxlXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAobWVtYmVyLmZpZWxkS2luZCAhPSBcInNjYWxhclwiICYmIG1lbWJlci5maWVsZEtpbmQgIT0gXCJlbnVtXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gb25seSBzY2FsYXIgYW5kIGVudW0gdmFsdWVzIGFyZSBpbW11dGFibGUsIG1hcCwgbGlzdCwgYW5kIG1lc3NhZ2VcbiAgICAgICAgICAgICAgICAgICAgLy8gYXJlIG5vdFxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKG1lbWJlci5wcmVzZW5jZSA9PSBJTVBMSUNJVCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBpbXBsaWNpdCBwcmVzZW5jZSB0cmFja3MgZmllbGQgcHJlc2VuY2UgYnkgemVybyB2YWx1ZXMgLSBlLmcuIDAsIGZhbHNlLCBcIlwiLCBhcmUgdW5zZXQsIDEsIHRydWUsIFwieFwiIGFyZSBzZXQuXG4gICAgICAgICAgICAgICAgICAgIC8vIG1lc3NhZ2UsIG1hcCwgbGlzdCBmaWVsZHMgYXJlIG11dGFibGUsIGFuZCBhbHNvIGhhdmUgSU1QTElDSVQgcHJlc2VuY2UuXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBtZW1iZXJzLmFkZChtZW1iZXIpO1xuICAgICAgICAgICAgICAgIHByb3RvdHlwZVttZW1iZXIubG9jYWxOYW1lXSA9IGNyZWF0ZVplcm9GaWVsZChtZW1iZXIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbWVzc2FnZVByb3RvdHlwZXMuc2V0KGRlc2MsIHsgcHJvdG90eXBlLCBtZW1iZXJzIH0pO1xuICAgICAgICB9XG4gICAgICAgIG1zZyA9IE9iamVjdC5jcmVhdGUocHJvdG90eXBlKTtcbiAgICAgICAgbXNnLiR0eXBlTmFtZSA9IGRlc2MudHlwZU5hbWU7XG4gICAgICAgIGZvciAoY29uc3QgbWVtYmVyIG9mIGRlc2MubWVtYmVycykge1xuICAgICAgICAgICAgaWYgKG1lbWJlcnMuaGFzKG1lbWJlcikpIHtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChtZW1iZXIua2luZCA9PSBcImZpZWxkXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAobWVtYmVyLmZpZWxkS2luZCA9PSBcIm1lc3NhZ2VcIikge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKG1lbWJlci5maWVsZEtpbmQgPT0gXCJzY2FsYXJcIiB8fCBtZW1iZXIuZmllbGRLaW5kID09IFwiZW51bVwiKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtZW1iZXIucHJlc2VuY2UgIT0gSU1QTElDSVQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbXNnW21lbWJlci5sb2NhbE5hbWVdID0gY3JlYXRlWmVyb0ZpZWxkKG1lbWJlcik7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG1zZztcbn1cbi8qKlxuICogRG8gd2UgbmVlZCB0aGUgcHJvdG90eXBlIGNoYWluIHRvIHRyYWNrIGZpZWxkIHByZXNlbmNlP1xuICovXG5mdW5jdGlvbiBuZWVkc1Byb3RvdHlwZUNoYWluKGRlc2MpIHtcbiAgICBzd2l0Y2ggKGRlc2MuZmlsZS5lZGl0aW9uKSB7XG4gICAgICAgIGNhc2UgRURJVElPTl9QUk9UTzM6XG4gICAgICAgICAgICAvLyBwcm90bzMgYWx3YXlzIHVzZXMgaW1wbGljaXQgcHJlc2VuY2UsIHdlIG5ldmVyIG5lZWQgdGhlIHByb3RvdHlwZSBjaGFpbi5cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgY2FzZSBFRElUSU9OX1BST1RPMjpcbiAgICAgICAgICAgIC8vIHByb3RvMiBuZXZlciB1c2VzIGltcGxpY2l0IHByZXNlbmNlLCB3ZSBhbHdheXMgbmVlZCB0aGUgcHJvdG90eXBlIGNoYWluLlxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAvLyBJZiBhIG1lc3NhZ2UgdXNlcyBzY2FsYXIgb3IgZW51bSBmaWVsZHMgd2l0aCBleHBsaWNpdCBwcmVzZW5jZSwgd2UgbmVlZFxuICAgICAgICAgICAgLy8gdGhlIHByb3RvdHlwZSBjaGFpbiB0byB0cmFjayBwcmVzZW5jZS4gVGhpcyBydWxlIGRvZXMgbm90IGFwcGx5IHRvIGZpZWxkc1xuICAgICAgICAgICAgLy8gaW4gYSBvbmVvZiBncm91cCAtIHRoZXkgdXNlIGEgZGlmZmVyZW50IG1lY2hhbmlzbSB0byB0cmFjayBwcmVzZW5jZS5cbiAgICAgICAgICAgIHJldHVybiBkZXNjLmZpZWxkcy5zb21lKChmKSA9PiBmLnByZXNlbmNlICE9IElNUExJQ0lUICYmIGYuZmllbGRLaW5kICE9IFwibWVzc2FnZVwiICYmICFmLm9uZW9mKTtcbiAgICB9XG59XG4vKipcbiAqIFJldHVybnMgYSB6ZXJvIHZhbHVlIGZvciBvbmVvZiBncm91cHMsIGFuZCBmb3IgZXZlcnkgZmllbGQga2luZCBleGNlcHRcbiAqIG1lc3NhZ2VzLiBTY2FsYXIgYW5kIGVudW0gZmllbGRzIGNhbiBoYXZlIGRlZmF1bHQgdmFsdWVzLlxuICovXG5mdW5jdGlvbiBjcmVhdGVaZXJvRmllbGQoZmllbGQpIHtcbiAgICBpZiAoZmllbGQua2luZCA9PSBcIm9uZW9mXCIpIHtcbiAgICAgICAgcmV0dXJuIHsgY2FzZTogdW5kZWZpbmVkIH07XG4gICAgfVxuICAgIGlmIChmaWVsZC5maWVsZEtpbmQgPT0gXCJsaXN0XCIpIHtcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgIH1cbiAgICBpZiAoZmllbGQuZmllbGRLaW5kID09IFwibWFwXCIpIHtcbiAgICAgICAgcmV0dXJuIHt9OyAvLyBPYmplY3QuY3JlYXRlKG51bGwpIHdvdWxkIGJlIGRlc2lyYWJsZSBoZXJlLCBidXQgaXMgdW5zdXBwb3J0ZWQgYnkgcmVhY3QgaHR0cHM6Ly9yZWFjdC5kZXYvcmVmZXJlbmNlL3JlYWN0L3VzZS1zZXJ2ZXIjc2VyaWFsaXphYmxlLXBhcmFtZXRlcnMtYW5kLXJldHVybi12YWx1ZXNcbiAgICB9XG4gICAgaWYgKGZpZWxkLmZpZWxkS2luZCA9PSBcIm1lc3NhZ2VcIikge1xuICAgICAgICByZXR1cm4gdG9rZW5aZXJvTWVzc2FnZUZpZWxkO1xuICAgIH1cbiAgICBjb25zdCBkZWZhdWx0VmFsdWUgPSBmaWVsZC5nZXREZWZhdWx0VmFsdWUoKTtcbiAgICBpZiAoZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIGZpZWxkLmZpZWxkS2luZCA9PSBcInNjYWxhclwiICYmIGZpZWxkLmxvbmdBc1N0cmluZ1xuICAgICAgICAgICAgPyBkZWZhdWx0VmFsdWUudG9TdHJpbmcoKVxuICAgICAgICAgICAgOiBkZWZhdWx0VmFsdWU7XG4gICAgfVxuICAgIHJldHVybiBmaWVsZC5maWVsZEtpbmQgPT0gXCJzY2FsYXJcIlxuICAgICAgICA/IHNjYWxhclplcm9WYWx1ZShmaWVsZC5zY2FsYXIsIGZpZWxkLmxvbmdBc1N0cmluZylcbiAgICAgICAgOiBmaWVsZC5lbnVtLnZhbHVlc1swXS5udW1iZXI7XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbmltcG9ydCB7IFNjYWxhclR5cGUsIH0gZnJvbSBcIi4uL2Rlc2NyaXB0b3JzLmpzXCI7XG5pbXBvcnQgeyBjaGVja0ZpZWxkLCBjaGVja0xpc3RJdGVtLCBjaGVja01hcEVudHJ5IH0gZnJvbSBcIi4vcmVmbGVjdC1jaGVjay5qc1wiO1xuaW1wb3J0IHsgRmllbGRFcnJvciB9IGZyb20gXCIuL2Vycm9yLmpzXCI7XG5pbXBvcnQgeyB1bnNhZmVDbGVhciwgdW5zYWZlR2V0LCB1bnNhZmVJc1NldCwgdW5zYWZlTG9jYWwsIHVuc2FmZU9uZW9mQ2FzZSwgdW5zYWZlU2V0LCB9IGZyb20gXCIuL3Vuc2FmZS5qc1wiO1xuaW1wb3J0IHsgY3JlYXRlIH0gZnJvbSBcIi4uL2NyZWF0ZS5qc1wiO1xuaW1wb3J0IHsgaXNXcmFwcGVyLCBpc1dyYXBwZXJEZXNjIH0gZnJvbSBcIi4uL3drdC93cmFwcGVycy5qc1wiO1xuaW1wb3J0IHsgc2NhbGFyWmVyb1ZhbHVlIH0gZnJvbSBcIi4vc2NhbGFyLmpzXCI7XG5pbXBvcnQgeyBwcm90b0ludDY0IH0gZnJvbSBcIi4uL3Byb3RvLWludDY0LmpzXCI7XG5pbXBvcnQgeyBpc09iamVjdCwgaXNSZWZsZWN0TGlzdCwgaXNSZWZsZWN0TWFwLCBpc1JlZmxlY3RNZXNzYWdlLCB9IGZyb20gXCIuL2d1YXJkLmpzXCI7XG4vKipcbiAqIENyZWF0ZSBhIFJlZmxlY3RNZXNzYWdlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVmbGVjdChtZXNzYWdlRGVzYywgbWVzc2FnZSwgXG4vKipcbiAqIEJ5IGRlZmF1bHQsIGZpZWxkIHZhbHVlcyBhcmUgdmFsaWRhdGVkIHdoZW4gc2V0dGluZyB0aGVtLiBGb3IgZXhhbXBsZSxcbiAqIGEgdmFsdWUgZm9yIGFuIHVpbnQzMiBmaWVsZCBtdXN0IGJlIGEgRUNNQVNjcmlwdCBOdW1iZXIgPj0gMC5cbiAqXG4gKiBXaGVuIGZpZWxkIHZhbHVlcyBhcmUgdHJ1c3RlZCwgcGVyZm9ybWFuY2UgY2FuIGJlIGltcHJvdmVkIGJ5IGRpc2FibGluZ1xuICogY2hlY2tzLlxuICovXG5jaGVjayA9IHRydWUpIHtcbiAgICByZXR1cm4gbmV3IFJlZmxlY3RNZXNzYWdlSW1wbChtZXNzYWdlRGVzYywgbWVzc2FnZSwgY2hlY2spO1xufVxuY2xhc3MgUmVmbGVjdE1lc3NhZ2VJbXBsIHtcbiAgICBnZXQgc29ydGVkRmllbGRzKCkge1xuICAgICAgICB2YXIgX2E7XG4gICAgICAgIHJldHVybiAoKF9hID0gdGhpcy5fc29ydGVkRmllbGRzKSAhPT0gbnVsbCAmJiBfYSAhPT0gdm9pZCAwID8gX2EgOiBcbiAgICAgICAgLy8gYmlvbWUtaWdub3JlIGxpbnQvc3VzcGljaW91cy9ub0Fzc2lnbkluRXhwcmVzc2lvbnM6IG5vXG4gICAgICAgICh0aGlzLl9zb3J0ZWRGaWVsZHMgPSB0aGlzLmRlc2MuZmllbGRzXG4gICAgICAgICAgICAuY29uY2F0KClcbiAgICAgICAgICAgIC5zb3J0KChhLCBiKSA9PiBhLm51bWJlciAtIGIubnVtYmVyKSkpO1xuICAgIH1cbiAgICBjb25zdHJ1Y3RvcihtZXNzYWdlRGVzYywgbWVzc2FnZSwgY2hlY2sgPSB0cnVlKSB7XG4gICAgICAgIHRoaXMubGlzdHMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMubWFwcyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5jaGVjayA9IGNoZWNrO1xuICAgICAgICB0aGlzLmRlc2MgPSBtZXNzYWdlRGVzYztcbiAgICAgICAgdGhpcy5tZXNzYWdlID0gdGhpc1t1bnNhZmVMb2NhbF0gPSBtZXNzYWdlICE9PSBudWxsICYmIG1lc3NhZ2UgIT09IHZvaWQgMCA/IG1lc3NhZ2UgOiBjcmVhdGUobWVzc2FnZURlc2MpO1xuICAgICAgICB0aGlzLmZpZWxkcyA9IG1lc3NhZ2VEZXNjLmZpZWxkcztcbiAgICAgICAgdGhpcy5vbmVvZnMgPSBtZXNzYWdlRGVzYy5vbmVvZnM7XG4gICAgICAgIHRoaXMubWVtYmVycyA9IG1lc3NhZ2VEZXNjLm1lbWJlcnM7XG4gICAgfVxuICAgIGZpbmROdW1iZXIobnVtYmVyKSB7XG4gICAgICAgIGlmICghdGhpcy5fZmllbGRzQnlOdW1iZXIpIHtcbiAgICAgICAgICAgIHRoaXMuX2ZpZWxkc0J5TnVtYmVyID0gbmV3IE1hcCh0aGlzLmRlc2MuZmllbGRzLm1hcCgoZikgPT4gW2YubnVtYmVyLCBmXSkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLl9maWVsZHNCeU51bWJlci5nZXQobnVtYmVyKTtcbiAgICB9XG4gICAgb25lb2ZDYXNlKG9uZW9mKSB7XG4gICAgICAgIGFzc2VydE93bih0aGlzLm1lc3NhZ2UsIG9uZW9mKTtcbiAgICAgICAgcmV0dXJuIHVuc2FmZU9uZW9mQ2FzZSh0aGlzLm1lc3NhZ2UsIG9uZW9mKTtcbiAgICB9XG4gICAgaXNTZXQoZmllbGQpIHtcbiAgICAgICAgYXNzZXJ0T3duKHRoaXMubWVzc2FnZSwgZmllbGQpO1xuICAgICAgICByZXR1cm4gdW5zYWZlSXNTZXQodGhpcy5tZXNzYWdlLCBmaWVsZCk7XG4gICAgfVxuICAgIGNsZWFyKGZpZWxkKSB7XG4gICAgICAgIGFzc2VydE93bih0aGlzLm1lc3NhZ2UsIGZpZWxkKTtcbiAgICAgICAgdW5zYWZlQ2xlYXIodGhpcy5tZXNzYWdlLCBmaWVsZCk7XG4gICAgfVxuICAgIGdldChmaWVsZCkge1xuICAgICAgICBhc3NlcnRPd24odGhpcy5tZXNzYWdlLCBmaWVsZCk7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gdW5zYWZlR2V0KHRoaXMubWVzc2FnZSwgZmllbGQpO1xuICAgICAgICBzd2l0Y2ggKGZpZWxkLmZpZWxkS2luZCkge1xuICAgICAgICAgICAgY2FzZSBcImxpc3RcIjpcbiAgICAgICAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY2FzZS1kZWNsYXJhdGlvbnNcbiAgICAgICAgICAgICAgICBsZXQgbGlzdCA9IHRoaXMubGlzdHMuZ2V0KGZpZWxkKTtcbiAgICAgICAgICAgICAgICBpZiAoIWxpc3QgfHwgbGlzdFt1bnNhZmVMb2NhbF0gIT09IHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubGlzdHMuc2V0KGZpZWxkLCBcbiAgICAgICAgICAgICAgICAgICAgLy8gYmlvbWUtaWdub3JlIGxpbnQvc3VzcGljaW91cy9ub0Fzc2lnbkluRXhwcmVzc2lvbnM6IG5vXG4gICAgICAgICAgICAgICAgICAgIChsaXN0ID0gbmV3IFJlZmxlY3RMaXN0SW1wbChmaWVsZCwgdmFsdWUsIHRoaXMuY2hlY2spKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBsaXN0O1xuICAgICAgICAgICAgY2FzZSBcIm1hcFwiOlxuICAgICAgICAgICAgICAgIGxldCBtYXAgPSB0aGlzLm1hcHMuZ2V0KGZpZWxkKTtcbiAgICAgICAgICAgICAgICBpZiAoIW1hcCB8fCBtYXBbdW5zYWZlTG9jYWxdICE9PSB2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm1hcHMuc2V0KGZpZWxkLCBcbiAgICAgICAgICAgICAgICAgICAgLy8gYmlvbWUtaWdub3JlIGxpbnQvc3VzcGljaW91cy9ub0Fzc2lnbkluRXhwcmVzc2lvbnM6IG5vXG4gICAgICAgICAgICAgICAgICAgIChtYXAgPSBuZXcgUmVmbGVjdE1hcEltcGwoZmllbGQsIHZhbHVlLCB0aGlzLmNoZWNrKSkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gbWFwO1xuICAgICAgICAgICAgY2FzZSBcIm1lc3NhZ2VcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gbWVzc2FnZVRvUmVmbGVjdChmaWVsZCwgdmFsdWUsIHRoaXMuY2hlY2spO1xuICAgICAgICAgICAgY2FzZSBcInNjYWxhclwiOlxuICAgICAgICAgICAgICAgIHJldHVybiAodmFsdWUgPT09IHVuZGVmaW5lZFxuICAgICAgICAgICAgICAgICAgICA/IHNjYWxhclplcm9WYWx1ZShmaWVsZC5zY2FsYXIsIGZhbHNlKVxuICAgICAgICAgICAgICAgICAgICA6IGxvbmdUb1JlZmxlY3QoZmllbGQsIHZhbHVlKSk7XG4gICAgICAgICAgICBjYXNlIFwiZW51bVwiOlxuICAgICAgICAgICAgICAgIHJldHVybiAodmFsdWUgIT09IG51bGwgJiYgdmFsdWUgIT09IHZvaWQgMCA/IHZhbHVlIDogZmllbGQuZW51bS52YWx1ZXNbMF0ubnVtYmVyKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBzZXQoZmllbGQsIHZhbHVlKSB7XG4gICAgICAgIGFzc2VydE93bih0aGlzLm1lc3NhZ2UsIGZpZWxkKTtcbiAgICAgICAgaWYgKHRoaXMuY2hlY2spIHtcbiAgICAgICAgICAgIGNvbnN0IGVyciA9IGNoZWNrRmllbGQoZmllbGQsIHZhbHVlKTtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgbGV0IGxvY2FsO1xuICAgICAgICBpZiAoZmllbGQuZmllbGRLaW5kID09IFwibWVzc2FnZVwiKSB7XG4gICAgICAgICAgICBsb2NhbCA9IG1lc3NhZ2VUb0xvY2FsKGZpZWxkLCB2YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoaXNSZWZsZWN0TWFwKHZhbHVlKSB8fCBpc1JlZmxlY3RMaXN0KHZhbHVlKSkge1xuICAgICAgICAgICAgbG9jYWwgPSB2YWx1ZVt1bnNhZmVMb2NhbF07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBsb2NhbCA9IGxvbmdUb0xvY2FsKGZpZWxkLCB2YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgICAgdW5zYWZlU2V0KHRoaXMubWVzc2FnZSwgZmllbGQsIGxvY2FsKTtcbiAgICB9XG4gICAgZ2V0VW5rbm93bigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubWVzc2FnZS4kdW5rbm93bjtcbiAgICB9XG4gICAgc2V0VW5rbm93bih2YWx1ZSkge1xuICAgICAgICB0aGlzLm1lc3NhZ2UuJHVua25vd24gPSB2YWx1ZTtcbiAgICB9XG59XG5mdW5jdGlvbiBhc3NlcnRPd24ob3duZXIsIG1lbWJlcikge1xuICAgIGlmIChtZW1iZXIucGFyZW50LnR5cGVOYW1lICE9PSBvd25lci4kdHlwZU5hbWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IEZpZWxkRXJyb3IobWVtYmVyLCBgY2Fubm90IHVzZSAke21lbWJlci50b1N0cmluZygpfSB3aXRoIG1lc3NhZ2UgJHtvd25lci4kdHlwZU5hbWV9YCwgXCJGb3JlaWduRmllbGRFcnJvclwiKTtcbiAgICB9XG59XG4vKipcbiAqIENyZWF0ZSBhIFJlZmxlY3RMaXN0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVmbGVjdExpc3QoZmllbGQsIHVuc2FmZUlucHV0LCBcbi8qKlxuICogQnkgZGVmYXVsdCwgZmllbGQgdmFsdWVzIGFyZSB2YWxpZGF0ZWQgd2hlbiBzZXR0aW5nIHRoZW0uIEZvciBleGFtcGxlLFxuICogYSB2YWx1ZSBmb3IgYW4gdWludDMyIGZpZWxkIG11c3QgYmUgYSBFQ01BU2NyaXB0IE51bWJlciA+PSAwLlxuICpcbiAqIFdoZW4gZmllbGQgdmFsdWVzIGFyZSB0cnVzdGVkLCBwZXJmb3JtYW5jZSBjYW4gYmUgaW1wcm92ZWQgYnkgZGlzYWJsaW5nXG4gKiBjaGVja3MuXG4gKi9cbmNoZWNrID0gdHJ1ZSkge1xuICAgIHJldHVybiBuZXcgUmVmbGVjdExpc3RJbXBsKGZpZWxkLCB1bnNhZmVJbnB1dCAhPT0gbnVsbCAmJiB1bnNhZmVJbnB1dCAhPT0gdm9pZCAwID8gdW5zYWZlSW5wdXQgOiBbXSwgY2hlY2spO1xufVxuY2xhc3MgUmVmbGVjdExpc3RJbXBsIHtcbiAgICBmaWVsZCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2ZpZWxkO1xuICAgIH1cbiAgICBnZXQgc2l6ZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2Fyci5sZW5ndGg7XG4gICAgfVxuICAgIGNvbnN0cnVjdG9yKGZpZWxkLCB1bnNhZmVJbnB1dCwgY2hlY2spIHtcbiAgICAgICAgdGhpcy5fZmllbGQgPSBmaWVsZDtcbiAgICAgICAgdGhpcy5fYXJyID0gdGhpc1t1bnNhZmVMb2NhbF0gPSB1bnNhZmVJbnB1dDtcbiAgICAgICAgdGhpcy5jaGVjayA9IGNoZWNrO1xuICAgIH1cbiAgICBnZXQoaW5kZXgpIHtcbiAgICAgICAgY29uc3QgaXRlbSA9IHRoaXMuX2FycltpbmRleF07XG4gICAgICAgIHJldHVybiBpdGVtID09PSB1bmRlZmluZWRcbiAgICAgICAgICAgID8gdW5kZWZpbmVkXG4gICAgICAgICAgICA6IGxpc3RJdGVtVG9SZWZsZWN0KHRoaXMuX2ZpZWxkLCBpdGVtLCB0aGlzLmNoZWNrKTtcbiAgICB9XG4gICAgc2V0KGluZGV4LCBpdGVtKSB7XG4gICAgICAgIGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy5fYXJyLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEZpZWxkRXJyb3IodGhpcy5fZmllbGQsIGBsaXN0IGl0ZW0gIyR7aW5kZXggKyAxfTogb3V0IG9mIHJhbmdlYCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuY2hlY2spIHtcbiAgICAgICAgICAgIGNvbnN0IGVyciA9IGNoZWNrTGlzdEl0ZW0odGhpcy5fZmllbGQsIGluZGV4LCBpdGVtKTtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fYXJyW2luZGV4XSA9IGxpc3RJdGVtVG9Mb2NhbCh0aGlzLl9maWVsZCwgaXRlbSk7XG4gICAgfVxuICAgIGFkZChpdGVtKSB7XG4gICAgICAgIGlmICh0aGlzLmNoZWNrKSB7XG4gICAgICAgICAgICBjb25zdCBlcnIgPSBjaGVja0xpc3RJdGVtKHRoaXMuX2ZpZWxkLCB0aGlzLl9hcnIubGVuZ3RoLCBpdGVtKTtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fYXJyLnB1c2gobGlzdEl0ZW1Ub0xvY2FsKHRoaXMuX2ZpZWxkLCBpdGVtKSk7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGNsZWFyKCkge1xuICAgICAgICB0aGlzLl9hcnIuc3BsaWNlKDAsIHRoaXMuX2Fyci5sZW5ndGgpO1xuICAgIH1cbiAgICBbU3ltYm9sLml0ZXJhdG9yXSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudmFsdWVzKCk7XG4gICAgfVxuICAgIGtleXMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9hcnIua2V5cygpO1xuICAgIH1cbiAgICAqdmFsdWVzKCkge1xuICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy5fYXJyKSB7XG4gICAgICAgICAgICB5aWVsZCBsaXN0SXRlbVRvUmVmbGVjdCh0aGlzLl9maWVsZCwgaXRlbSwgdGhpcy5jaGVjayk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgKmVudHJpZXMoKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fYXJyLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB5aWVsZCBbaSwgbGlzdEl0ZW1Ub1JlZmxlY3QodGhpcy5fZmllbGQsIHRoaXMuX2FycltpXSwgdGhpcy5jaGVjayldO1xuICAgICAgICB9XG4gICAgfVxufVxuLyoqXG4gKiBDcmVhdGUgYSBSZWZsZWN0TWFwLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVmbGVjdE1hcChmaWVsZCwgdW5zYWZlSW5wdXQsIFxuLyoqXG4gKiBCeSBkZWZhdWx0LCBmaWVsZCB2YWx1ZXMgYXJlIHZhbGlkYXRlZCB3aGVuIHNldHRpbmcgdGhlbS4gRm9yIGV4YW1wbGUsXG4gKiBhIHZhbHVlIGZvciBhbiB1aW50MzIgZmllbGQgbXVzdCBiZSBhIEVDTUFTY3JpcHQgTnVtYmVyID49IDAuXG4gKlxuICogV2hlbiBmaWVsZCB2YWx1ZXMgYXJlIHRydXN0ZWQsIHBlcmZvcm1hbmNlIGNhbiBiZSBpbXByb3ZlZCBieSBkaXNhYmxpbmdcbiAqIGNoZWNrcy5cbiAqL1xuY2hlY2sgPSB0cnVlKSB7XG4gICAgcmV0dXJuIG5ldyBSZWZsZWN0TWFwSW1wbChmaWVsZCwgdW5zYWZlSW5wdXQsIGNoZWNrKTtcbn1cbmNsYXNzIFJlZmxlY3RNYXBJbXBsIHtcbiAgICBjb25zdHJ1Y3RvcihmaWVsZCwgdW5zYWZlSW5wdXQsIGNoZWNrID0gdHJ1ZSkge1xuICAgICAgICB0aGlzLm9iaiA9IHRoaXNbdW5zYWZlTG9jYWxdID0gdW5zYWZlSW5wdXQgIT09IG51bGwgJiYgdW5zYWZlSW5wdXQgIT09IHZvaWQgMCA/IHVuc2FmZUlucHV0IDoge307XG4gICAgICAgIHRoaXMuY2hlY2sgPSBjaGVjaztcbiAgICAgICAgdGhpcy5fZmllbGQgPSBmaWVsZDtcbiAgICB9XG4gICAgZmllbGQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9maWVsZDtcbiAgICB9XG4gICAgc2V0KGtleSwgdmFsdWUpIHtcbiAgICAgICAgaWYgKHRoaXMuY2hlY2spIHtcbiAgICAgICAgICAgIGNvbnN0IGVyciA9IGNoZWNrTWFwRW50cnkodGhpcy5fZmllbGQsIGtleSwgdmFsdWUpO1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLm9ialttYXBLZXlUb0xvY2FsKGtleSldID0gbWFwVmFsdWVUb0xvY2FsKHRoaXMuX2ZpZWxkLCB2YWx1ZSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICBkZWxldGUoa2V5KSB7XG4gICAgICAgIGNvbnN0IGsgPSBtYXBLZXlUb0xvY2FsKGtleSk7XG4gICAgICAgIGNvbnN0IGhhcyA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0aGlzLm9iaiwgayk7XG4gICAgICAgIGlmIChoYXMpIHtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLm9ialtrXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gaGFzO1xuICAgIH1cbiAgICBjbGVhcigpIHtcbiAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXModGhpcy5vYmopKSB7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5vYmpba2V5XTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBnZXQoa2V5KSB7XG4gICAgICAgIGxldCB2YWwgPSB0aGlzLm9ialttYXBLZXlUb0xvY2FsKGtleSldO1xuICAgICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHZhbCA9IG1hcFZhbHVlVG9SZWZsZWN0KHRoaXMuX2ZpZWxkLCB2YWwsIHRoaXMuY2hlY2spO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB2YWw7XG4gICAgfVxuICAgIGhhcyhrZXkpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0aGlzLm9iaiwgbWFwS2V5VG9Mb2NhbChrZXkpKTtcbiAgICB9XG4gICAgKmtleXMoKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqS2V5IG9mIE9iamVjdC5rZXlzKHRoaXMub2JqKSkge1xuICAgICAgICAgICAgeWllbGQgbWFwS2V5VG9SZWZsZWN0KG9iaktleSwgdGhpcy5fZmllbGQubWFwS2V5KTtcbiAgICAgICAgfVxuICAgIH1cbiAgICAqZW50cmllcygpIHtcbiAgICAgICAgZm9yIChjb25zdCBvYmpFbnRyeSBvZiBPYmplY3QuZW50cmllcyh0aGlzLm9iaikpIHtcbiAgICAgICAgICAgIHlpZWxkIFtcbiAgICAgICAgICAgICAgICBtYXBLZXlUb1JlZmxlY3Qob2JqRW50cnlbMF0sIHRoaXMuX2ZpZWxkLm1hcEtleSksXG4gICAgICAgICAgICAgICAgbWFwVmFsdWVUb1JlZmxlY3QodGhpcy5fZmllbGQsIG9iakVudHJ5WzFdLCB0aGlzLmNoZWNrKSxcbiAgICAgICAgICAgIF07XG4gICAgICAgIH1cbiAgICB9XG4gICAgW1N5bWJvbC5pdGVyYXRvcl0oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmVudHJpZXMoKTtcbiAgICB9XG4gICAgZ2V0IHNpemUoKSB7XG4gICAgICAgIHJldHVybiBPYmplY3Qua2V5cyh0aGlzLm9iaikubGVuZ3RoO1xuICAgIH1cbiAgICAqdmFsdWVzKCkge1xuICAgICAgICBmb3IgKGNvbnN0IHZhbCBvZiBPYmplY3QudmFsdWVzKHRoaXMub2JqKSkge1xuICAgICAgICAgICAgeWllbGQgbWFwVmFsdWVUb1JlZmxlY3QodGhpcy5fZmllbGQsIHZhbCwgdGhpcy5jaGVjayk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yRWFjaChjYWxsYmFja2ZuLCB0aGlzQXJnKSB7XG4gICAgICAgIGZvciAoY29uc3QgbWFwRW50cnkgb2YgdGhpcy5lbnRyaWVzKCkpIHtcbiAgICAgICAgICAgIGNhbGxiYWNrZm4uY2FsbCh0aGlzQXJnLCBtYXBFbnRyeVsxXSwgbWFwRW50cnlbMF0sIHRoaXMpO1xuICAgICAgICB9XG4gICAgfVxufVxuZnVuY3Rpb24gbWVzc2FnZVRvTG9jYWwoZmllbGQsIHZhbHVlKSB7XG4gICAgaWYgKCFpc1JlZmxlY3RNZXNzYWdlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuICAgIGlmIChpc1dyYXBwZXIodmFsdWUubWVzc2FnZSkgJiZcbiAgICAgICAgIWZpZWxkLm9uZW9mICYmXG4gICAgICAgIGZpZWxkLmZpZWxkS2luZCA9PSBcIm1lc3NhZ2VcIikge1xuICAgICAgICAvLyBUeXBlcyBmcm9tIGdvb2dsZS9wcm90b2J1Zi93cmFwcGVycy5wcm90byBhcmUgdW53cmFwcGVkIHdoZW4gdXNlZCBpblxuICAgICAgICAvLyBhIHNpbmd1bGFyIGZpZWxkIHRoYXQgaXMgbm90IHBhcnQgb2YgYSBvbmVvZiBncm91cC5cbiAgICAgICAgcmV0dXJuIHZhbHVlLm1lc3NhZ2UudmFsdWU7XG4gICAgfVxuICAgIGlmICh2YWx1ZS5kZXNjLnR5cGVOYW1lID09IFwiZ29vZ2xlLnByb3RvYnVmLlN0cnVjdFwiICYmXG4gICAgICAgIGZpZWxkLnBhcmVudC50eXBlTmFtZSAhPSBcImdvb2dsZS5wcm90b2J1Zi5WYWx1ZVwiKSB7XG4gICAgICAgIC8vIGdvb2dsZS5wcm90b2J1Zi5TdHJ1Y3QgaXMgcmVwcmVzZW50ZWQgd2l0aCBKc29uT2JqZWN0IHdoZW4gdXNlZCBpbiBhXG4gICAgICAgIC8vIGZpZWxkLCBleGNlcHQgd2hlbiB1c2VkIGluIGdvb2dsZS5wcm90b2J1Zi5WYWx1ZS5cbiAgICAgICAgcmV0dXJuIHdrdFN0cnVjdFRvTG9jYWwodmFsdWUubWVzc2FnZSk7XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZS5tZXNzYWdlO1xufVxuZnVuY3Rpb24gbWVzc2FnZVRvUmVmbGVjdChmaWVsZCwgdmFsdWUsIGNoZWNrKSB7XG4gICAgaWYgKHZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgaWYgKGlzV3JhcHBlckRlc2MoZmllbGQubWVzc2FnZSkgJiZcbiAgICAgICAgICAgICFmaWVsZC5vbmVvZiAmJlxuICAgICAgICAgICAgZmllbGQuZmllbGRLaW5kID09IFwibWVzc2FnZVwiKSB7XG4gICAgICAgICAgICAvLyBUeXBlcyBmcm9tIGdvb2dsZS9wcm90b2J1Zi93cmFwcGVycy5wcm90byBhcmUgdW53cmFwcGVkIHdoZW4gdXNlZCBpblxuICAgICAgICAgICAgLy8gYSBzaW5ndWxhciBmaWVsZCB0aGF0IGlzIG5vdCBwYXJ0IG9mIGEgb25lb2YgZ3JvdXAuXG4gICAgICAgICAgICB2YWx1ZSA9IHtcbiAgICAgICAgICAgICAgICAkdHlwZU5hbWU6IGZpZWxkLm1lc3NhZ2UudHlwZU5hbWUsXG4gICAgICAgICAgICAgICAgdmFsdWU6IGxvbmdUb1JlZmxlY3QoZmllbGQubWVzc2FnZS5maWVsZHNbMF0sIHZhbHVlKSxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoZmllbGQubWVzc2FnZS50eXBlTmFtZSA9PSBcImdvb2dsZS5wcm90b2J1Zi5TdHJ1Y3RcIiAmJlxuICAgICAgICAgICAgZmllbGQucGFyZW50LnR5cGVOYW1lICE9IFwiZ29vZ2xlLnByb3RvYnVmLlZhbHVlXCIgJiZcbiAgICAgICAgICAgIGlzT2JqZWN0KHZhbHVlKSkge1xuICAgICAgICAgICAgLy8gZ29vZ2xlLnByb3RvYnVmLlN0cnVjdCBpcyByZXByZXNlbnRlZCB3aXRoIEpzb25PYmplY3Qgd2hlbiB1c2VkIGluIGFcbiAgICAgICAgICAgIC8vIGZpZWxkLCBleGNlcHQgd2hlbiB1c2VkIGluIGdvb2dsZS5wcm90b2J1Zi5WYWx1ZS5cbiAgICAgICAgICAgIHZhbHVlID0gd2t0U3RydWN0VG9SZWZsZWN0KHZhbHVlKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbmV3IFJlZmxlY3RNZXNzYWdlSW1wbChmaWVsZC5tZXNzYWdlLCB2YWx1ZSwgY2hlY2spO1xufVxuZnVuY3Rpb24gbGlzdEl0ZW1Ub0xvY2FsKGZpZWxkLCB2YWx1ZSkge1xuICAgIGlmIChmaWVsZC5saXN0S2luZCA9PSBcIm1lc3NhZ2VcIikge1xuICAgICAgICByZXR1cm4gbWVzc2FnZVRvTG9jYWwoZmllbGQsIHZhbHVlKTtcbiAgICB9XG4gICAgcmV0dXJuIGxvbmdUb0xvY2FsKGZpZWxkLCB2YWx1ZSk7XG59XG5mdW5jdGlvbiBsaXN0SXRlbVRvUmVmbGVjdChmaWVsZCwgdmFsdWUsIGNoZWNrKSB7XG4gICAgaWYgKGZpZWxkLmxpc3RLaW5kID09IFwibWVzc2FnZVwiKSB7XG4gICAgICAgIHJldHVybiBtZXNzYWdlVG9SZWZsZWN0KGZpZWxkLCB2YWx1ZSwgY2hlY2spO1xuICAgIH1cbiAgICByZXR1cm4gbG9uZ1RvUmVmbGVjdChmaWVsZCwgdmFsdWUpO1xufVxuZnVuY3Rpb24gbWFwVmFsdWVUb0xvY2FsKGZpZWxkLCB2YWx1ZSkge1xuICAgIGlmIChmaWVsZC5tYXBLaW5kID09IFwibWVzc2FnZVwiKSB7XG4gICAgICAgIHJldHVybiBtZXNzYWdlVG9Mb2NhbChmaWVsZCwgdmFsdWUpO1xuICAgIH1cbiAgICByZXR1cm4gbG9uZ1RvTG9jYWwoZmllbGQsIHZhbHVlKTtcbn1cbmZ1bmN0aW9uIG1hcFZhbHVlVG9SZWZsZWN0KGZpZWxkLCB2YWx1ZSwgY2hlY2spIHtcbiAgICBpZiAoZmllbGQubWFwS2luZCA9PSBcIm1lc3NhZ2VcIikge1xuICAgICAgICByZXR1cm4gbWVzc2FnZVRvUmVmbGVjdChmaWVsZCwgdmFsdWUsIGNoZWNrKTtcbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlO1xufVxuZnVuY3Rpb24gbWFwS2V5VG9Mb2NhbChrZXkpIHtcbiAgICByZXR1cm4gdHlwZW9mIGtleSA9PSBcInN0cmluZ1wiIHx8IHR5cGVvZiBrZXkgPT0gXCJudW1iZXJcIiA/IGtleSA6IFN0cmluZyhrZXkpO1xufVxuLyoqXG4gKiBDb252ZXJ0cyBhIG1hcCBrZXkgKGFueSBzY2FsYXIgdmFsdWUgZXhjZXB0IGZsb2F0LCBkb3VibGUsIG9yIGJ5dGVzKSBmcm9tIGl0c1xuICogcmVwcmVzZW50YXRpb24gaW4gYSBtZXNzYWdlIChzdHJpbmcgb3IgbnVtYmVyLCB0aGUgb25seSBwb3NzaWJsZSBvYmplY3Qga2V5XG4gKiB0eXBlcykgdG8gdGhlIGNsb3Nlc3QgcG9zc2libGUgdHlwZSBpbiBFQ01BU2NyaXB0LlxuICovXG5mdW5jdGlvbiBtYXBLZXlUb1JlZmxlY3Qoa2V5LCB0eXBlKSB7XG4gICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TVFJJTkc6XG4gICAgICAgICAgICByZXR1cm4ga2V5O1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuSU5UMzI6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5GSVhFRDMyOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuVUlOVDMyOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0ZJWEVEMzI6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TSU5UMzI6IHtcbiAgICAgICAgICAgIGNvbnN0IG4gPSBOdW1iZXIucGFyc2VJbnQoa2V5KTtcbiAgICAgICAgICAgIGlmIChOdW1iZXIuaXNGaW5pdGUobikpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5CT09MOlxuICAgICAgICAgICAgc3dpdGNoIChrZXkpIHtcbiAgICAgICAgICAgICAgICBjYXNlIFwidHJ1ZVwiOlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICBjYXNlIFwiZmFsc2VcIjpcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5VSU5UNjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5GSVhFRDY0OlxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcHJvdG9JbnQ2NC51UGFyc2Uoa2V5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhdGNoIChfYSkge1xuICAgICAgICAgICAgICAgIC8vXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIC8vIElOVDY0LCBTRklYRUQ2NCwgU0lOVDY0XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHJldHVybiBwcm90b0ludDY0LnBhcnNlKGtleSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXRjaCAoX2IpIHtcbiAgICAgICAgICAgICAgICAvL1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiBrZXk7XG59XG5mdW5jdGlvbiBsb25nVG9SZWZsZWN0KGZpZWxkLCB2YWx1ZSkge1xuICAgIHN3aXRjaCAoZmllbGQuc2NhbGFyKSB7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5JTlQ2NDpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNGSVhFRDY0OlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0lOVDY0OlxuICAgICAgICAgICAgaWYgKFwibG9uZ0FzU3RyaW5nXCIgaW4gZmllbGQgJiZcbiAgICAgICAgICAgICAgICBmaWVsZC5sb25nQXNTdHJpbmcgJiZcbiAgICAgICAgICAgICAgICB0eXBlb2YgdmFsdWUgPT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIHZhbHVlID0gcHJvdG9JbnQ2NC5wYXJzZSh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZJWEVENjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5VSU5UNjQ6XG4gICAgICAgICAgICBpZiAoXCJsb25nQXNTdHJpbmdcIiBpbiBmaWVsZCAmJlxuICAgICAgICAgICAgICAgIGZpZWxkLmxvbmdBc1N0cmluZyAmJlxuICAgICAgICAgICAgICAgIHR5cGVvZiB2YWx1ZSA9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSBwcm90b0ludDY0LnVQYXJzZSh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlO1xufVxuZnVuY3Rpb24gbG9uZ1RvTG9jYWwoZmllbGQsIHZhbHVlKSB7XG4gICAgc3dpdGNoIChmaWVsZC5zY2FsYXIpIHtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLklOVDY0OlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0ZJWEVENjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TSU5UNjQ6XG4gICAgICAgICAgICBpZiAoXCJsb25nQXNTdHJpbmdcIiBpbiBmaWVsZCAmJiBmaWVsZC5sb25nQXNTdHJpbmcpIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IFN0cmluZyh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT0gXCJzdHJpbmdcIiB8fCB0eXBlb2YgdmFsdWUgPT0gXCJudW1iZXJcIikge1xuICAgICAgICAgICAgICAgIHZhbHVlID0gcHJvdG9JbnQ2NC5wYXJzZSh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZJWEVENjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5VSU5UNjQ6XG4gICAgICAgICAgICBpZiAoXCJsb25nQXNTdHJpbmdcIiBpbiBmaWVsZCAmJiBmaWVsZC5sb25nQXNTdHJpbmcpIHtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IFN0cmluZyh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT0gXCJzdHJpbmdcIiB8fCB0eXBlb2YgdmFsdWUgPT0gXCJudW1iZXJcIikge1xuICAgICAgICAgICAgICAgIHZhbHVlID0gcHJvdG9JbnQ2NC51UGFyc2UodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZTtcbn1cbmZ1bmN0aW9uIHdrdFN0cnVjdFRvUmVmbGVjdChqc29uKSB7XG4gICAgY29uc3Qgc3RydWN0ID0ge1xuICAgICAgICAkdHlwZU5hbWU6IFwiZ29vZ2xlLnByb3RvYnVmLlN0cnVjdFwiLFxuICAgICAgICBmaWVsZHM6IHt9LFxuICAgIH07XG4gICAgaWYgKGlzT2JqZWN0KGpzb24pKSB7XG4gICAgICAgIGZvciAoY29uc3QgW2ssIHZdIG9mIE9iamVjdC5lbnRyaWVzKGpzb24pKSB7XG4gICAgICAgICAgICBzdHJ1Y3QuZmllbGRzW2tdID0gd2t0VmFsdWVUb1JlZmxlY3Qodik7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHN0cnVjdDtcbn1cbmZ1bmN0aW9uIHdrdFN0cnVjdFRvTG9jYWwodmFsKSB7XG4gICAgY29uc3QganNvbiA9IHt9O1xuICAgIGZvciAoY29uc3QgW2ssIHZdIG9mIE9iamVjdC5lbnRyaWVzKHZhbC5maWVsZHMpKSB7XG4gICAgICAgIGpzb25ba10gPSB3a3RWYWx1ZVRvTG9jYWwodik7XG4gICAgfVxuICAgIHJldHVybiBqc29uO1xufVxuZnVuY3Rpb24gd2t0VmFsdWVUb0xvY2FsKHZhbCkge1xuICAgIHN3aXRjaCAodmFsLmtpbmQuY2FzZSkge1xuICAgICAgICBjYXNlIFwic3RydWN0VmFsdWVcIjpcbiAgICAgICAgICAgIHJldHVybiB3a3RTdHJ1Y3RUb0xvY2FsKHZhbC5raW5kLnZhbHVlKTtcbiAgICAgICAgY2FzZSBcImxpc3RWYWx1ZVwiOlxuICAgICAgICAgICAgcmV0dXJuIHZhbC5raW5kLnZhbHVlLnZhbHVlcy5tYXAod2t0VmFsdWVUb0xvY2FsKTtcbiAgICAgICAgY2FzZSBcIm51bGxWYWx1ZVwiOlxuICAgICAgICBjYXNlIHVuZGVmaW5lZDpcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgcmV0dXJuIHZhbC5raW5kLnZhbHVlO1xuICAgIH1cbn1cbmZ1bmN0aW9uIHdrdFZhbHVlVG9SZWZsZWN0KGpzb24pIHtcbiAgICBjb25zdCB2YWx1ZSA9IHtcbiAgICAgICAgJHR5cGVOYW1lOiBcImdvb2dsZS5wcm90b2J1Zi5WYWx1ZVwiLFxuICAgICAgICBraW5kOiB7IGNhc2U6IHVuZGVmaW5lZCB9LFxuICAgIH07XG4gICAgc3dpdGNoICh0eXBlb2YganNvbikge1xuICAgICAgICBjYXNlIFwibnVtYmVyXCI6XG4gICAgICAgICAgICB2YWx1ZS5raW5kID0geyBjYXNlOiBcIm51bWJlclZhbHVlXCIsIHZhbHVlOiBqc29uIH07XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcInN0cmluZ1wiOlxuICAgICAgICAgICAgdmFsdWUua2luZCA9IHsgY2FzZTogXCJzdHJpbmdWYWx1ZVwiLCB2YWx1ZToganNvbiB9O1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJib29sZWFuXCI6XG4gICAgICAgICAgICB2YWx1ZS5raW5kID0geyBjYXNlOiBcImJvb2xWYWx1ZVwiLCB2YWx1ZToganNvbiB9O1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJvYmplY3RcIjpcbiAgICAgICAgICAgIGlmIChqc29uID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbnVsbFZhbHVlID0gMDtcbiAgICAgICAgICAgICAgICB2YWx1ZS5raW5kID0geyBjYXNlOiBcIm51bGxWYWx1ZVwiLCB2YWx1ZTogbnVsbFZhbHVlIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChBcnJheS5pc0FycmF5KGpzb24pKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbGlzdFZhbHVlID0ge1xuICAgICAgICAgICAgICAgICAgICAkdHlwZU5hbWU6IFwiZ29vZ2xlLnByb3RvYnVmLkxpc3RWYWx1ZVwiLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZXM6IFtdLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoanNvbikpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBlIG9mIGpzb24pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpc3RWYWx1ZS52YWx1ZXMucHVzaCh3a3RWYWx1ZVRvUmVmbGVjdChlKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFsdWUua2luZCA9IHtcbiAgICAgICAgICAgICAgICAgICAgY2FzZTogXCJsaXN0VmFsdWVcIixcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IGxpc3RWYWx1ZSxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFsdWUua2luZCA9IHtcbiAgICAgICAgICAgICAgICAgICAgY2FzZTogXCJzdHJ1Y3RWYWx1ZVwiLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogd2t0U3RydWN0VG9SZWZsZWN0KGpzb24pLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlO1xufVxuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5pbXBvcnQgeyByZWZsZWN0IH0gZnJvbSBcIi4vcmVmbGVjdC9yZWZsZWN0LmpzXCI7XG5pbXBvcnQgeyBCaW5hcnlXcml0ZXIsIFdpcmVUeXBlIH0gZnJvbSBcIi4vd2lyZS9iaW5hcnktZW5jb2RpbmcuanNcIjtcbmltcG9ydCB7IFNjYWxhclR5cGUgfSBmcm9tIFwiLi9kZXNjcmlwdG9ycy5qc1wiO1xuLy8gYm9vdHN0cmFwLWluamVjdCBnb29nbGUucHJvdG9idWYuRmVhdHVyZVNldC5GaWVsZFByZXNlbmNlLkxFR0FDWV9SRVFVSVJFRDogY29uc3QgJG5hbWU6IEZlYXR1cmVTZXRfRmllbGRQcmVzZW5jZS4kbG9jYWxOYW1lID0gJG51bWJlcjtcbmNvbnN0IExFR0FDWV9SRVFVSVJFRCA9IDM7XG4vLyBEZWZhdWx0IG9wdGlvbnMgZm9yIHNlcmlhbGl6aW5nIGJpbmFyeSBkYXRhLlxuY29uc3Qgd3JpdGVEZWZhdWx0cyA9IHtcbiAgICB3cml0ZVVua25vd25GaWVsZHM6IHRydWUsXG59O1xuZnVuY3Rpb24gbWFrZVdyaXRlT3B0aW9ucyhvcHRpb25zKSB7XG4gICAgcmV0dXJuIG9wdGlvbnMgPyBPYmplY3QuYXNzaWduKE9iamVjdC5hc3NpZ24oe30sIHdyaXRlRGVmYXVsdHMpLCBvcHRpb25zKSA6IHdyaXRlRGVmYXVsdHM7XG59XG5leHBvcnQgZnVuY3Rpb24gdG9CaW5hcnkoc2NoZW1hLCBtZXNzYWdlLCBvcHRpb25zKSB7XG4gICAgcmV0dXJuIHdyaXRlRmllbGRzKG5ldyBCaW5hcnlXcml0ZXIoKSwgbWFrZVdyaXRlT3B0aW9ucyhvcHRpb25zKSwgcmVmbGVjdChzY2hlbWEsIG1lc3NhZ2UpKS5maW5pc2goKTtcbn1cbmZ1bmN0aW9uIHdyaXRlRmllbGRzKHdyaXRlciwgb3B0cywgbXNnKSB7XG4gICAgdmFyIF9hO1xuICAgIGZvciAoY29uc3QgZiBvZiBtc2cuc29ydGVkRmllbGRzKSB7XG4gICAgICAgIGlmICghbXNnLmlzU2V0KGYpKSB7XG4gICAgICAgICAgICBpZiAoZi5wcmVzZW5jZSA9PSBMRUdBQ1lfUkVRVUlSRUQpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGNhbm5vdCBlbmNvZGUgJHtmfSB0byBiaW5hcnk6IHJlcXVpcmVkIGZpZWxkIG5vdCBzZXRgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHdyaXRlRmllbGQod3JpdGVyLCBvcHRzLCBtc2csIGYpO1xuICAgIH1cbiAgICBpZiAob3B0cy53cml0ZVVua25vd25GaWVsZHMpIHtcbiAgICAgICAgZm9yIChjb25zdCB7IG5vLCB3aXJlVHlwZSwgZGF0YSB9IG9mIChfYSA9IG1zZy5nZXRVbmtub3duKCkpICE9PSBudWxsICYmIF9hICE9PSB2b2lkIDAgPyBfYSA6IFtdKSB7XG4gICAgICAgICAgICB3cml0ZXIudGFnKG5vLCB3aXJlVHlwZSkucmF3KGRhdGEpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB3cml0ZXI7XG59XG4vKipcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3cml0ZUZpZWxkKHdyaXRlciwgb3B0cywgbXNnLCBmaWVsZCkge1xuICAgIHZhciBfYTtcbiAgICBzd2l0Y2ggKGZpZWxkLmZpZWxkS2luZCkge1xuICAgICAgICBjYXNlIFwic2NhbGFyXCI6XG4gICAgICAgIGNhc2UgXCJlbnVtXCI6XG4gICAgICAgICAgICB3cml0ZVNjYWxhcih3cml0ZXIsIG1zZy5kZXNjLnR5cGVOYW1lLCBmaWVsZC5uYW1lLCAoX2EgPSBmaWVsZC5zY2FsYXIpICE9PSBudWxsICYmIF9hICE9PSB2b2lkIDAgPyBfYSA6IFNjYWxhclR5cGUuSU5UMzIsIGZpZWxkLm51bWJlciwgbXNnLmdldChmaWVsZCkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJsaXN0XCI6XG4gICAgICAgICAgICB3cml0ZUxpc3RGaWVsZCh3cml0ZXIsIG9wdHMsIGZpZWxkLCBtc2cuZ2V0KGZpZWxkKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIm1lc3NhZ2VcIjpcbiAgICAgICAgICAgIHdyaXRlTWVzc2FnZUZpZWxkKHdyaXRlciwgb3B0cywgZmllbGQsIG1zZy5nZXQoZmllbGQpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwibWFwXCI6XG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbF0gb2YgbXNnLmdldChmaWVsZCkpIHtcbiAgICAgICAgICAgICAgICB3cml0ZU1hcEVudHJ5KHdyaXRlciwgb3B0cywgZmllbGQsIGtleSwgdmFsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgIH1cbn1cbmZ1bmN0aW9uIHdyaXRlU2NhbGFyKHdyaXRlciwgbXNnTmFtZSwgZmllbGROYW1lLCBzY2FsYXJUeXBlLCBmaWVsZE5vLCB2YWx1ZSkge1xuICAgIHdyaXRlU2NhbGFyVmFsdWUod3JpdGVyLnRhZyhmaWVsZE5vLCB3cml0ZVR5cGVPZlNjYWxhcihzY2FsYXJUeXBlKSksIG1zZ05hbWUsIGZpZWxkTmFtZSwgc2NhbGFyVHlwZSwgdmFsdWUpO1xufVxuZnVuY3Rpb24gd3JpdGVNZXNzYWdlRmllbGQod3JpdGVyLCBvcHRzLCBmaWVsZCwgbWVzc2FnZSkge1xuICAgIGlmIChmaWVsZC5kZWxpbWl0ZWRFbmNvZGluZykge1xuICAgICAgICB3cml0ZUZpZWxkcyh3cml0ZXIudGFnKGZpZWxkLm51bWJlciwgV2lyZVR5cGUuU3RhcnRHcm91cCksIG9wdHMsIG1lc3NhZ2UpLnRhZyhmaWVsZC5udW1iZXIsIFdpcmVUeXBlLkVuZEdyb3VwKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHdyaXRlRmllbGRzKHdyaXRlci50YWcoZmllbGQubnVtYmVyLCBXaXJlVHlwZS5MZW5ndGhEZWxpbWl0ZWQpLmZvcmsoKSwgb3B0cywgbWVzc2FnZSkuam9pbigpO1xuICAgIH1cbn1cbmZ1bmN0aW9uIHdyaXRlTGlzdEZpZWxkKHdyaXRlciwgb3B0cywgZmllbGQsIGxpc3QpIHtcbiAgICB2YXIgX2E7XG4gICAgaWYgKGZpZWxkLmxpc3RLaW5kID09IFwibWVzc2FnZVwiKSB7XG4gICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBsaXN0KSB7XG4gICAgICAgICAgICB3cml0ZU1lc3NhZ2VGaWVsZCh3cml0ZXIsIG9wdHMsIGZpZWxkLCBpdGVtKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHNjYWxhclR5cGUgPSAoX2EgPSBmaWVsZC5zY2FsYXIpICE9PSBudWxsICYmIF9hICE9PSB2b2lkIDAgPyBfYSA6IFNjYWxhclR5cGUuSU5UMzI7XG4gICAgaWYgKGZpZWxkLnBhY2tlZCkge1xuICAgICAgICBpZiAoIWxpc3Quc2l6ZSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHdyaXRlci50YWcoZmllbGQubnVtYmVyLCBXaXJlVHlwZS5MZW5ndGhEZWxpbWl0ZWQpLmZvcmsoKTtcbiAgICAgICAgZm9yIChjb25zdCBpdGVtIG9mIGxpc3QpIHtcbiAgICAgICAgICAgIHdyaXRlU2NhbGFyVmFsdWUod3JpdGVyLCBmaWVsZC5wYXJlbnQudHlwZU5hbWUsIGZpZWxkLm5hbWUsIHNjYWxhclR5cGUsIGl0ZW0pO1xuICAgICAgICB9XG4gICAgICAgIHdyaXRlci5qb2luKCk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZm9yIChjb25zdCBpdGVtIG9mIGxpc3QpIHtcbiAgICAgICAgd3JpdGVTY2FsYXIod3JpdGVyLCBmaWVsZC5wYXJlbnQudHlwZU5hbWUsIGZpZWxkLm5hbWUsIHNjYWxhclR5cGUsIGZpZWxkLm51bWJlciwgaXRlbSk7XG4gICAgfVxufVxuZnVuY3Rpb24gd3JpdGVNYXBFbnRyeSh3cml0ZXIsIG9wdHMsIGZpZWxkLCBrZXksIHZhbHVlKSB7XG4gICAgdmFyIF9hO1xuICAgIHdyaXRlci50YWcoZmllbGQubnVtYmVyLCBXaXJlVHlwZS5MZW5ndGhEZWxpbWl0ZWQpLmZvcmsoKTtcbiAgICAvLyB3cml0ZSBrZXksIGV4cGVjdGluZyBrZXkgZmllbGQgbnVtYmVyID0gMVxuICAgIHdyaXRlU2NhbGFyKHdyaXRlciwgZmllbGQucGFyZW50LnR5cGVOYW1lLCBmaWVsZC5uYW1lLCBmaWVsZC5tYXBLZXksIDEsIGtleSk7XG4gICAgLy8gd3JpdGUgdmFsdWUsIGV4cGVjdGluZyB2YWx1ZSBmaWVsZCBudW1iZXIgPSAyXG4gICAgc3dpdGNoIChmaWVsZC5tYXBLaW5kKSB7XG4gICAgICAgIGNhc2UgXCJzY2FsYXJcIjpcbiAgICAgICAgY2FzZSBcImVudW1cIjpcbiAgICAgICAgICAgIHdyaXRlU2NhbGFyKHdyaXRlciwgZmllbGQucGFyZW50LnR5cGVOYW1lLCBmaWVsZC5uYW1lLCAoX2EgPSBmaWVsZC5zY2FsYXIpICE9PSBudWxsICYmIF9hICE9PSB2b2lkIDAgPyBfYSA6IFNjYWxhclR5cGUuSU5UMzIsIDIsIHZhbHVlKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwibWVzc2FnZVwiOlxuICAgICAgICAgICAgd3JpdGVGaWVsZHMod3JpdGVyLnRhZygyLCBXaXJlVHlwZS5MZW5ndGhEZWxpbWl0ZWQpLmZvcmsoKSwgb3B0cywgdmFsdWUpLmpvaW4oKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICB3cml0ZXIuam9pbigpO1xufVxuZnVuY3Rpb24gd3JpdGVTY2FsYXJWYWx1ZSh3cml0ZXIsIG1zZ05hbWUsIGZpZWxkTmFtZSwgdHlwZSwgdmFsdWUpIHtcbiAgICB0cnkge1xuICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TVFJJTkc6XG4gICAgICAgICAgICAgICAgd3JpdGVyLnN0cmluZyh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFNjYWxhclR5cGUuQk9PTDpcbiAgICAgICAgICAgICAgICB3cml0ZXIuYm9vbCh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFNjYWxhclR5cGUuRE9VQkxFOlxuICAgICAgICAgICAgICAgIHdyaXRlci5kb3VibGUodmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZMT0FUOlxuICAgICAgICAgICAgICAgIHdyaXRlci5mbG9hdCh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFNjYWxhclR5cGUuSU5UMzI6XG4gICAgICAgICAgICAgICAgd3JpdGVyLmludDMyKHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgU2NhbGFyVHlwZS5JTlQ2NDpcbiAgICAgICAgICAgICAgICB3cml0ZXIuaW50NjQodmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlVJTlQ2NDpcbiAgICAgICAgICAgICAgICB3cml0ZXIudWludDY0KHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgU2NhbGFyVHlwZS5GSVhFRDY0OlxuICAgICAgICAgICAgICAgIHdyaXRlci5maXhlZDY0KHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgU2NhbGFyVHlwZS5CWVRFUzpcbiAgICAgICAgICAgICAgICB3cml0ZXIuYnl0ZXModmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZJWEVEMzI6XG4gICAgICAgICAgICAgICAgd3JpdGVyLmZpeGVkMzIodmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNGSVhFRDMyOlxuICAgICAgICAgICAgICAgIHdyaXRlci5zZml4ZWQzMih2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0ZJWEVENjQ6XG4gICAgICAgICAgICAgICAgd3JpdGVyLnNmaXhlZDY0KHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TSU5UNjQ6XG4gICAgICAgICAgICAgICAgd3JpdGVyLnNpbnQ2NCh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFNjYWxhclR5cGUuVUlOVDMyOlxuICAgICAgICAgICAgICAgIHdyaXRlci51aW50MzIodmFsdWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNJTlQzMjpcbiAgICAgICAgICAgICAgICB3cml0ZXIuc2ludDMyKHZhbHVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cbiAgICBjYXRjaCAoZSkge1xuICAgICAgICBpZiAoZSBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGNhbm5vdCBlbmNvZGUgZmllbGQgJHttc2dOYW1lfS4ke2ZpZWxkTmFtZX0gdG8gYmluYXJ5OiAke2UubWVzc2FnZX1gKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlO1xuICAgIH1cbn1cbmZ1bmN0aW9uIHdyaXRlVHlwZU9mU2NhbGFyKHR5cGUpIHtcbiAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkJZVEVTOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU1RSSU5HOlxuICAgICAgICAgICAgcmV0dXJuIFdpcmVUeXBlLkxlbmd0aERlbGltaXRlZDtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkRPVUJMRTpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZJWEVENjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TRklYRUQ2NDpcbiAgICAgICAgICAgIHJldHVybiBXaXJlVHlwZS5CaXQ2NDtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZJWEVEMzI6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TRklYRUQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZMT0FUOlxuICAgICAgICAgICAgcmV0dXJuIFdpcmVUeXBlLkJpdDMyO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgcmV0dXJuIFdpcmVUeXBlLlZhcmludDtcbiAgICB9XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbmltcG9ydCB7IFNjYWxhclR5cGUgfSBmcm9tIFwiLi9kZXNjcmlwdG9ycy5qc1wiO1xuaW1wb3J0IHsgcmVmbGVjdCB9IGZyb20gXCIuL3JlZmxlY3QvcmVmbGVjdC5qc1wiO1xuaW1wb3J0IHsgaXNSZWZsZWN0TWVzc2FnZSB9IGZyb20gXCIuL3JlZmxlY3QvZ3VhcmQuanNcIjtcbi8qKlxuICogQ3JlYXRlIGEgZGVlcCBjb3B5IG9mIGEgbWVzc2FnZSwgaW5jbHVkaW5nIGV4dGVuc2lvbnMgYW5kIHVua25vd24gZmllbGRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2xvbmUoc2NoZW1hLCBtZXNzYWdlKSB7XG4gICAgcmV0dXJuIGNsb25lUmVmbGVjdChyZWZsZWN0KHNjaGVtYSwgbWVzc2FnZSkpLm1lc3NhZ2U7XG59XG5mdW5jdGlvbiBjbG9uZVJlZmxlY3QoaSkge1xuICAgIGNvbnN0IG8gPSByZWZsZWN0KGkuZGVzYyk7XG4gICAgZm9yIChjb25zdCBmIG9mIGkuZmllbGRzKSB7XG4gICAgICAgIGlmICghaS5pc1NldChmKSkge1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgc3dpdGNoIChmLmZpZWxkS2luZCkge1xuICAgICAgICAgICAgY2FzZSBcImxpc3RcIjpcbiAgICAgICAgICAgICAgICBjb25zdCBsaXN0ID0gby5nZXQoZik7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBpdGVtIG9mIGkuZ2V0KGYpKSB7XG4gICAgICAgICAgICAgICAgICAgIGxpc3QuYWRkKGNsb25lU2luZ3VsYXIoZiwgaXRlbSkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJtYXBcIjpcbiAgICAgICAgICAgICAgICBjb25zdCBtYXAgPSBvLmdldChmKTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIGkuZ2V0KGYpLmVudHJpZXMoKSkge1xuICAgICAgICAgICAgICAgICAgICBtYXAuc2V0KGVudHJ5WzBdLCBjbG9uZVNpbmd1bGFyKGYsIGVudHJ5WzFdKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDoge1xuICAgICAgICAgICAgICAgIG8uc2V0KGYsIGNsb25lU2luZ3VsYXIoZiwgaS5nZXQoZikpKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBjb25zdCB1bmtub3duID0gaS5nZXRVbmtub3duKCk7XG4gICAgaWYgKHVua25vd24gJiYgdW5rbm93bi5sZW5ndGggPiAwKSB7XG4gICAgICAgIG8uc2V0VW5rbm93bihbLi4udW5rbm93bl0pO1xuICAgIH1cbiAgICByZXR1cm4gbztcbn1cbmZ1bmN0aW9uIGNsb25lU2luZ3VsYXIoZmllbGQsIHZhbHVlKSB7XG4gICAgaWYgKGZpZWxkLm1lc3NhZ2UgIT09IHVuZGVmaW5lZCAmJiBpc1JlZmxlY3RNZXNzYWdlKHZhbHVlKSkge1xuICAgICAgICByZXR1cm4gY2xvbmVSZWZsZWN0KHZhbHVlKTtcbiAgICB9XG4gICAgaWYgKGZpZWxkLnNjYWxhciA9PSBTY2FsYXJUeXBlLkJZVEVTICYmIHZhbHVlIGluc3RhbmNlb2YgVWludDhBcnJheSkge1xuICAgICAgICAvLyBAdHMtZXhwZWN0LWVycm9yIFQgY2Fubm90IGV4dGVuZCBVaW50OEFycmF5IGluIHByYWN0aWNlXG4gICAgICAgIHJldHVybiB2YWx1ZS5zbGljZSgpO1xuICAgIH1cbiAgICByZXR1cm4gdmFsdWU7XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbi8qKlxuICogSHlkcmF0ZSBhIG1lc3NhZ2UgZGVzY3JpcHRvci5cbiAqXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gbWVzc2FnZURlc2MoZmlsZSwgcGF0aCwgLi4ucGF0aHMpIHtcbiAgICByZXR1cm4gcGF0aHMucmVkdWNlKChhY2MsIGN1cikgPT4gYWNjLm5lc3RlZE1lc3NhZ2VzW2N1cl0sIGZpbGUubWVzc2FnZXNbcGF0aF0pO1xufVxuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4vKipcbiAqIEh5ZHJhdGUgYW4gZW51bSBkZXNjcmlwdG9yLlxuICpcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBlbnVtRGVzYyhmaWxlLCBwYXRoLCAuLi5wYXRocykge1xuICAgIGlmIChwYXRocy5sZW5ndGggPT0gMCkge1xuICAgICAgICByZXR1cm4gZmlsZS5lbnVtc1twYXRoXTtcbiAgICB9XG4gICAgY29uc3QgZSA9IHBhdGhzLnBvcCgpOyAvLyB3ZSBjaGVja2VkIGxlbmd0aCBhYm92ZVxuICAgIHJldHVybiBwYXRocy5yZWR1Y2UoKGFjYywgY3VyKSA9PiBhY2MubmVzdGVkTWVzc2FnZXNbY3VyXSwgZmlsZS5tZXNzYWdlc1twYXRoXSkubmVzdGVkRW51bXNbZV07XG59XG4vKipcbiAqIENvbnN0cnVjdCBhIFR5cGVTY3JpcHQgZW51bSBvYmplY3QgYXQgcnVudGltZSBmcm9tIGEgZGVzY3JpcHRvci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRzRW51bShkZXNjKSB7XG4gICAgY29uc3QgZW51bU9iamVjdCA9IHt9O1xuICAgIGZvciAoY29uc3QgdmFsdWUgb2YgZGVzYy52YWx1ZXMpIHtcbiAgICAgICAgZW51bU9iamVjdFt2YWx1ZS5sb2NhbE5hbWVdID0gdmFsdWUubnVtYmVyO1xuICAgICAgICBlbnVtT2JqZWN0W3ZhbHVlLm51bWJlcl0gPSB2YWx1ZS5sb2NhbE5hbWU7XG4gICAgfVxuICAgIHJldHVybiBlbnVtT2JqZWN0O1xufVxuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5pbXBvcnQgeyBib290IH0gZnJvbSBcIi4uLy4uLy4uLy4uL2NvZGVnZW52Mi9ib290LmpzXCI7XG5pbXBvcnQgeyBtZXNzYWdlRGVzYyB9IGZyb20gXCIuLi8uLi8uLi8uLi9jb2RlZ2VudjIvbWVzc2FnZS5qc1wiO1xuaW1wb3J0IHsgZW51bURlc2MgfSBmcm9tIFwiLi4vLi4vLi4vLi4vY29kZWdlbnYyL2VudW0uanNcIjtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBmaWxlIGdvb2dsZS9wcm90b2J1Zi9kZXNjcmlwdG9yLnByb3RvLlxuICovXG5leHBvcnQgY29uc3QgZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciA9IC8qQF9fUFVSRV9fKi8gYm9vdCh7IFwibmFtZVwiOiBcImdvb2dsZS9wcm90b2J1Zi9kZXNjcmlwdG9yLnByb3RvXCIsIFwicGFja2FnZVwiOiBcImdvb2dsZS5wcm90b2J1ZlwiLCBcIm1lc3NhZ2VUeXBlXCI6IFt7IFwibmFtZVwiOiBcIkZpbGVEZXNjcmlwdG9yU2V0XCIsIFwiZmllbGRcIjogW3sgXCJuYW1lXCI6IFwiZmlsZVwiLCBcIm51bWJlclwiOiAxLCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMywgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmlsZURlc2NyaXB0b3JQcm90b1wiIH1dLCBcImV4dGVuc2lvblJhbmdlXCI6IFt7IFwic3RhcnRcIjogNTM2MDAwMDAwLCBcImVuZFwiOiA1MzYwMDAwMDEgfV0gfSwgeyBcIm5hbWVcIjogXCJGaWxlRGVzY3JpcHRvclByb3RvXCIsIFwiZmllbGRcIjogW3sgXCJuYW1lXCI6IFwibmFtZVwiLCBcIm51bWJlclwiOiAxLCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwicGFja2FnZVwiLCBcIm51bWJlclwiOiAyLCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiZGVwZW5kZW5jeVwiLCBcIm51bWJlclwiOiAzLCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAzIH0sIHsgXCJuYW1lXCI6IFwicHVibGljX2RlcGVuZGVuY3lcIiwgXCJudW1iZXJcIjogMTAsIFwidHlwZVwiOiA1LCBcImxhYmVsXCI6IDMgfSwgeyBcIm5hbWVcIjogXCJ3ZWFrX2RlcGVuZGVuY3lcIiwgXCJudW1iZXJcIjogMTEsIFwidHlwZVwiOiA1LCBcImxhYmVsXCI6IDMgfSwgeyBcIm5hbWVcIjogXCJvcHRpb25fZGVwZW5kZW5jeVwiLCBcIm51bWJlclwiOiAxNSwgXCJ0eXBlXCI6IDksIFwibGFiZWxcIjogMyB9LCB7IFwibmFtZVwiOiBcIm1lc3NhZ2VfdHlwZVwiLCBcIm51bWJlclwiOiA0LCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMywgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRGVzY3JpcHRvclByb3RvXCIgfSwgeyBcIm5hbWVcIjogXCJlbnVtX3R5cGVcIiwgXCJudW1iZXJcIjogNSwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDMsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkVudW1EZXNjcmlwdG9yUHJvdG9cIiB9LCB7IFwibmFtZVwiOiBcInNlcnZpY2VcIiwgXCJudW1iZXJcIjogNiwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDMsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLlNlcnZpY2VEZXNjcmlwdG9yUHJvdG9cIiB9LCB7IFwibmFtZVwiOiBcImV4dGVuc2lvblwiLCBcIm51bWJlclwiOiA3LCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMywgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmllbGREZXNjcmlwdG9yUHJvdG9cIiB9LCB7IFwibmFtZVwiOiBcIm9wdGlvbnNcIiwgXCJudW1iZXJcIjogOCwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZpbGVPcHRpb25zXCIgfSwgeyBcIm5hbWVcIjogXCJzb3VyY2VfY29kZV9pbmZvXCIsIFwibnVtYmVyXCI6IDksIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5Tb3VyY2VDb2RlSW5mb1wiIH0sIHsgXCJuYW1lXCI6IFwic3ludGF4XCIsIFwibnVtYmVyXCI6IDEyLCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiZWRpdGlvblwiLCBcIm51bWJlclwiOiAxNCwgXCJ0eXBlXCI6IDE0LCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkVkaXRpb25cIiB9XSB9LCB7IFwibmFtZVwiOiBcIkRlc2NyaXB0b3JQcm90b1wiLCBcImZpZWxkXCI6IFt7IFwibmFtZVwiOiBcIm5hbWVcIiwgXCJudW1iZXJcIjogMSwgXCJ0eXBlXCI6IDksIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcImZpZWxkXCIsIFwibnVtYmVyXCI6IDIsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAzLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5GaWVsZERlc2NyaXB0b3JQcm90b1wiIH0sIHsgXCJuYW1lXCI6IFwiZXh0ZW5zaW9uXCIsIFwibnVtYmVyXCI6IDYsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAzLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5GaWVsZERlc2NyaXB0b3JQcm90b1wiIH0sIHsgXCJuYW1lXCI6IFwibmVzdGVkX3R5cGVcIiwgXCJudW1iZXJcIjogMywgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDMsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkRlc2NyaXB0b3JQcm90b1wiIH0sIHsgXCJuYW1lXCI6IFwiZW51bV90eXBlXCIsIFwibnVtYmVyXCI6IDQsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAzLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5FbnVtRGVzY3JpcHRvclByb3RvXCIgfSwgeyBcIm5hbWVcIjogXCJleHRlbnNpb25fcmFuZ2VcIiwgXCJudW1iZXJcIjogNSwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDMsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkRlc2NyaXB0b3JQcm90by5FeHRlbnNpb25SYW5nZVwiIH0sIHsgXCJuYW1lXCI6IFwib25lb2ZfZGVjbFwiLCBcIm51bWJlclwiOiA4LCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMywgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuT25lb2ZEZXNjcmlwdG9yUHJvdG9cIiB9LCB7IFwibmFtZVwiOiBcIm9wdGlvbnNcIiwgXCJudW1iZXJcIjogNywgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLk1lc3NhZ2VPcHRpb25zXCIgfSwgeyBcIm5hbWVcIjogXCJyZXNlcnZlZF9yYW5nZVwiLCBcIm51bWJlclwiOiA5LCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMywgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRGVzY3JpcHRvclByb3RvLlJlc2VydmVkUmFuZ2VcIiB9LCB7IFwibmFtZVwiOiBcInJlc2VydmVkX25hbWVcIiwgXCJudW1iZXJcIjogMTAsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDMgfSwgeyBcIm5hbWVcIjogXCJ2aXNpYmlsaXR5XCIsIFwibnVtYmVyXCI6IDExLCBcInR5cGVcIjogMTQsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuU3ltYm9sVmlzaWJpbGl0eVwiIH1dLCBcIm5lc3RlZFR5cGVcIjogW3sgXCJuYW1lXCI6IFwiRXh0ZW5zaW9uUmFuZ2VcIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJzdGFydFwiLCBcIm51bWJlclwiOiAxLCBcInR5cGVcIjogNSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiZW5kXCIsIFwibnVtYmVyXCI6IDIsIFwidHlwZVwiOiA1LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJvcHRpb25zXCIsIFwibnVtYmVyXCI6IDMsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5FeHRlbnNpb25SYW5nZU9wdGlvbnNcIiB9XSB9LCB7IFwibmFtZVwiOiBcIlJlc2VydmVkUmFuZ2VcIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJzdGFydFwiLCBcIm51bWJlclwiOiAxLCBcInR5cGVcIjogNSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiZW5kXCIsIFwibnVtYmVyXCI6IDIsIFwidHlwZVwiOiA1LCBcImxhYmVsXCI6IDEgfV0gfV0gfSwgeyBcIm5hbWVcIjogXCJFeHRlbnNpb25SYW5nZU9wdGlvbnNcIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJ1bmludGVycHJldGVkX29wdGlvblwiLCBcIm51bWJlclwiOiA5OTksIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAzLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5VbmludGVycHJldGVkT3B0aW9uXCIgfSwgeyBcIm5hbWVcIjogXCJkZWNsYXJhdGlvblwiLCBcIm51bWJlclwiOiAyLCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMywgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRXh0ZW5zaW9uUmFuZ2VPcHRpb25zLkRlY2xhcmF0aW9uXCIsIFwib3B0aW9uc1wiOiB7IFwicmV0ZW50aW9uXCI6IDIgfSB9LCB7IFwibmFtZVwiOiBcImZlYXR1cmVzXCIsIFwibnVtYmVyXCI6IDUwLCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmVhdHVyZVNldFwiIH0sIHsgXCJuYW1lXCI6IFwidmVyaWZpY2F0aW9uXCIsIFwibnVtYmVyXCI6IDMsIFwidHlwZVwiOiAxNCwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5FeHRlbnNpb25SYW5nZU9wdGlvbnMuVmVyaWZpY2F0aW9uU3RhdGVcIiwgXCJkZWZhdWx0VmFsdWVcIjogXCJVTlZFUklGSUVEXCIsIFwib3B0aW9uc1wiOiB7IFwicmV0ZW50aW9uXCI6IDIgfSB9XSwgXCJuZXN0ZWRUeXBlXCI6IFt7IFwibmFtZVwiOiBcIkRlY2xhcmF0aW9uXCIsIFwiZmllbGRcIjogW3sgXCJuYW1lXCI6IFwibnVtYmVyXCIsIFwibnVtYmVyXCI6IDEsIFwidHlwZVwiOiA1LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJmdWxsX25hbWVcIiwgXCJudW1iZXJcIjogMiwgXCJ0eXBlXCI6IDksIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcInR5cGVcIiwgXCJudW1iZXJcIjogMywgXCJ0eXBlXCI6IDksIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcInJlc2VydmVkXCIsIFwibnVtYmVyXCI6IDUsIFwidHlwZVwiOiA4LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJyZXBlYXRlZFwiLCBcIm51bWJlclwiOiA2LCBcInR5cGVcIjogOCwgXCJsYWJlbFwiOiAxIH1dIH1dLCBcImVudW1UeXBlXCI6IFt7IFwibmFtZVwiOiBcIlZlcmlmaWNhdGlvblN0YXRlXCIsIFwidmFsdWVcIjogW3sgXCJuYW1lXCI6IFwiREVDTEFSQVRJT05cIiwgXCJudW1iZXJcIjogMCB9LCB7IFwibmFtZVwiOiBcIlVOVkVSSUZJRURcIiwgXCJudW1iZXJcIjogMSB9XSB9XSwgXCJleHRlbnNpb25SYW5nZVwiOiBbeyBcInN0YXJ0XCI6IDEwMDAsIFwiZW5kXCI6IDUzNjg3MDkxMiB9XSB9LCB7IFwibmFtZVwiOiBcIkZpZWxkRGVzY3JpcHRvclByb3RvXCIsIFwiZmllbGRcIjogW3sgXCJuYW1lXCI6IFwibmFtZVwiLCBcIm51bWJlclwiOiAxLCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwibnVtYmVyXCIsIFwibnVtYmVyXCI6IDMsIFwidHlwZVwiOiA1LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJsYWJlbFwiLCBcIm51bWJlclwiOiA0LCBcInR5cGVcIjogMTQsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmllbGREZXNjcmlwdG9yUHJvdG8uTGFiZWxcIiB9LCB7IFwibmFtZVwiOiBcInR5cGVcIiwgXCJudW1iZXJcIjogNSwgXCJ0eXBlXCI6IDE0LCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZpZWxkRGVzY3JpcHRvclByb3RvLlR5cGVcIiB9LCB7IFwibmFtZVwiOiBcInR5cGVfbmFtZVwiLCBcIm51bWJlclwiOiA2LCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiZXh0ZW5kZWVcIiwgXCJudW1iZXJcIjogMiwgXCJ0eXBlXCI6IDksIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcImRlZmF1bHRfdmFsdWVcIiwgXCJudW1iZXJcIjogNywgXCJ0eXBlXCI6IDksIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcIm9uZW9mX2luZGV4XCIsIFwibnVtYmVyXCI6IDksIFwidHlwZVwiOiA1LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJqc29uX25hbWVcIiwgXCJudW1iZXJcIjogMTAsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJvcHRpb25zXCIsIFwibnVtYmVyXCI6IDgsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5GaWVsZE9wdGlvbnNcIiB9LCB7IFwibmFtZVwiOiBcInByb3RvM19vcHRpb25hbFwiLCBcIm51bWJlclwiOiAxNywgXCJ0eXBlXCI6IDgsIFwibGFiZWxcIjogMSB9XSwgXCJlbnVtVHlwZVwiOiBbeyBcIm5hbWVcIjogXCJUeXBlXCIsIFwidmFsdWVcIjogW3sgXCJuYW1lXCI6IFwiVFlQRV9ET1VCTEVcIiwgXCJudW1iZXJcIjogMSB9LCB7IFwibmFtZVwiOiBcIlRZUEVfRkxPQVRcIiwgXCJudW1iZXJcIjogMiB9LCB7IFwibmFtZVwiOiBcIlRZUEVfSU5UNjRcIiwgXCJudW1iZXJcIjogMyB9LCB7IFwibmFtZVwiOiBcIlRZUEVfVUlOVDY0XCIsIFwibnVtYmVyXCI6IDQgfSwgeyBcIm5hbWVcIjogXCJUWVBFX0lOVDMyXCIsIFwibnVtYmVyXCI6IDUgfSwgeyBcIm5hbWVcIjogXCJUWVBFX0ZJWEVENjRcIiwgXCJudW1iZXJcIjogNiB9LCB7IFwibmFtZVwiOiBcIlRZUEVfRklYRUQzMlwiLCBcIm51bWJlclwiOiA3IH0sIHsgXCJuYW1lXCI6IFwiVFlQRV9CT09MXCIsIFwibnVtYmVyXCI6IDggfSwgeyBcIm5hbWVcIjogXCJUWVBFX1NUUklOR1wiLCBcIm51bWJlclwiOiA5IH0sIHsgXCJuYW1lXCI6IFwiVFlQRV9HUk9VUFwiLCBcIm51bWJlclwiOiAxMCB9LCB7IFwibmFtZVwiOiBcIlRZUEVfTUVTU0FHRVwiLCBcIm51bWJlclwiOiAxMSB9LCB7IFwibmFtZVwiOiBcIlRZUEVfQllURVNcIiwgXCJudW1iZXJcIjogMTIgfSwgeyBcIm5hbWVcIjogXCJUWVBFX1VJTlQzMlwiLCBcIm51bWJlclwiOiAxMyB9LCB7IFwibmFtZVwiOiBcIlRZUEVfRU5VTVwiLCBcIm51bWJlclwiOiAxNCB9LCB7IFwibmFtZVwiOiBcIlRZUEVfU0ZJWEVEMzJcIiwgXCJudW1iZXJcIjogMTUgfSwgeyBcIm5hbWVcIjogXCJUWVBFX1NGSVhFRDY0XCIsIFwibnVtYmVyXCI6IDE2IH0sIHsgXCJuYW1lXCI6IFwiVFlQRV9TSU5UMzJcIiwgXCJudW1iZXJcIjogMTcgfSwgeyBcIm5hbWVcIjogXCJUWVBFX1NJTlQ2NFwiLCBcIm51bWJlclwiOiAxOCB9XSB9LCB7IFwibmFtZVwiOiBcIkxhYmVsXCIsIFwidmFsdWVcIjogW3sgXCJuYW1lXCI6IFwiTEFCRUxfT1BUSU9OQUxcIiwgXCJudW1iZXJcIjogMSB9LCB7IFwibmFtZVwiOiBcIkxBQkVMX1JFUEVBVEVEXCIsIFwibnVtYmVyXCI6IDMgfSwgeyBcIm5hbWVcIjogXCJMQUJFTF9SRVFVSVJFRFwiLCBcIm51bWJlclwiOiAyIH1dIH1dIH0sIHsgXCJuYW1lXCI6IFwiT25lb2ZEZXNjcmlwdG9yUHJvdG9cIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJuYW1lXCIsIFwibnVtYmVyXCI6IDEsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJvcHRpb25zXCIsIFwibnVtYmVyXCI6IDIsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5PbmVvZk9wdGlvbnNcIiB9XSB9LCB7IFwibmFtZVwiOiBcIkVudW1EZXNjcmlwdG9yUHJvdG9cIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJuYW1lXCIsIFwibnVtYmVyXCI6IDEsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJ2YWx1ZVwiLCBcIm51bWJlclwiOiAyLCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMywgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRW51bVZhbHVlRGVzY3JpcHRvclByb3RvXCIgfSwgeyBcIm5hbWVcIjogXCJvcHRpb25zXCIsIFwibnVtYmVyXCI6IDMsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5FbnVtT3B0aW9uc1wiIH0sIHsgXCJuYW1lXCI6IFwicmVzZXJ2ZWRfcmFuZ2VcIiwgXCJudW1iZXJcIjogNCwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDMsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkVudW1EZXNjcmlwdG9yUHJvdG8uRW51bVJlc2VydmVkUmFuZ2VcIiB9LCB7IFwibmFtZVwiOiBcInJlc2VydmVkX25hbWVcIiwgXCJudW1iZXJcIjogNSwgXCJ0eXBlXCI6IDksIFwibGFiZWxcIjogMyB9LCB7IFwibmFtZVwiOiBcInZpc2liaWxpdHlcIiwgXCJudW1iZXJcIjogNiwgXCJ0eXBlXCI6IDE0LCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLlN5bWJvbFZpc2liaWxpdHlcIiB9XSwgXCJuZXN0ZWRUeXBlXCI6IFt7IFwibmFtZVwiOiBcIkVudW1SZXNlcnZlZFJhbmdlXCIsIFwiZmllbGRcIjogW3sgXCJuYW1lXCI6IFwic3RhcnRcIiwgXCJudW1iZXJcIjogMSwgXCJ0eXBlXCI6IDUsIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcImVuZFwiLCBcIm51bWJlclwiOiAyLCBcInR5cGVcIjogNSwgXCJsYWJlbFwiOiAxIH1dIH1dIH0sIHsgXCJuYW1lXCI6IFwiRW51bVZhbHVlRGVzY3JpcHRvclByb3RvXCIsIFwiZmllbGRcIjogW3sgXCJuYW1lXCI6IFwibmFtZVwiLCBcIm51bWJlclwiOiAxLCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwibnVtYmVyXCIsIFwibnVtYmVyXCI6IDIsIFwidHlwZVwiOiA1LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJvcHRpb25zXCIsIFwibnVtYmVyXCI6IDMsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5FbnVtVmFsdWVPcHRpb25zXCIgfV0gfSwgeyBcIm5hbWVcIjogXCJTZXJ2aWNlRGVzY3JpcHRvclByb3RvXCIsIFwiZmllbGRcIjogW3sgXCJuYW1lXCI6IFwibmFtZVwiLCBcIm51bWJlclwiOiAxLCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwibWV0aG9kXCIsIFwibnVtYmVyXCI6IDIsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAzLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5NZXRob2REZXNjcmlwdG9yUHJvdG9cIiB9LCB7IFwibmFtZVwiOiBcIm9wdGlvbnNcIiwgXCJudW1iZXJcIjogMywgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLlNlcnZpY2VPcHRpb25zXCIgfV0gfSwgeyBcIm5hbWVcIjogXCJNZXRob2REZXNjcmlwdG9yUHJvdG9cIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJuYW1lXCIsIFwibnVtYmVyXCI6IDEsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJpbnB1dF90eXBlXCIsIFwibnVtYmVyXCI6IDIsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJvdXRwdXRfdHlwZVwiLCBcIm51bWJlclwiOiAzLCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwib3B0aW9uc1wiLCBcIm51bWJlclwiOiA0LCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuTWV0aG9kT3B0aW9uc1wiIH0sIHsgXCJuYW1lXCI6IFwiY2xpZW50X3N0cmVhbWluZ1wiLCBcIm51bWJlclwiOiA1LCBcInR5cGVcIjogOCwgXCJsYWJlbFwiOiAxLCBcImRlZmF1bHRWYWx1ZVwiOiBcImZhbHNlXCIgfSwgeyBcIm5hbWVcIjogXCJzZXJ2ZXJfc3RyZWFtaW5nXCIsIFwibnVtYmVyXCI6IDYsIFwidHlwZVwiOiA4LCBcImxhYmVsXCI6IDEsIFwiZGVmYXVsdFZhbHVlXCI6IFwiZmFsc2VcIiB9XSB9LCB7IFwibmFtZVwiOiBcIkZpbGVPcHRpb25zXCIsIFwiZmllbGRcIjogW3sgXCJuYW1lXCI6IFwiamF2YV9wYWNrYWdlXCIsIFwibnVtYmVyXCI6IDEsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJqYXZhX291dGVyX2NsYXNzbmFtZVwiLCBcIm51bWJlclwiOiA4LCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiamF2YV9tdWx0aXBsZV9maWxlc1wiLCBcIm51bWJlclwiOiAxMCwgXCJ0eXBlXCI6IDgsIFwibGFiZWxcIjogMSwgXCJkZWZhdWx0VmFsdWVcIjogXCJmYWxzZVwiIH0sIHsgXCJuYW1lXCI6IFwiamF2YV9nZW5lcmF0ZV9lcXVhbHNfYW5kX2hhc2hcIiwgXCJudW1iZXJcIjogMjAsIFwidHlwZVwiOiA4LCBcImxhYmVsXCI6IDEsIFwib3B0aW9uc1wiOiB7IFwiZGVwcmVjYXRlZFwiOiB0cnVlIH0gfSwgeyBcIm5hbWVcIjogXCJqYXZhX3N0cmluZ19jaGVja191dGY4XCIsIFwibnVtYmVyXCI6IDI3LCBcInR5cGVcIjogOCwgXCJsYWJlbFwiOiAxLCBcImRlZmF1bHRWYWx1ZVwiOiBcImZhbHNlXCIgfSwgeyBcIm5hbWVcIjogXCJvcHRpbWl6ZV9mb3JcIiwgXCJudW1iZXJcIjogOSwgXCJ0eXBlXCI6IDE0LCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZpbGVPcHRpb25zLk9wdGltaXplTW9kZVwiLCBcImRlZmF1bHRWYWx1ZVwiOiBcIlNQRUVEXCIgfSwgeyBcIm5hbWVcIjogXCJnb19wYWNrYWdlXCIsIFwibnVtYmVyXCI6IDExLCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiY2NfZ2VuZXJpY19zZXJ2aWNlc1wiLCBcIm51bWJlclwiOiAxNiwgXCJ0eXBlXCI6IDgsIFwibGFiZWxcIjogMSwgXCJkZWZhdWx0VmFsdWVcIjogXCJmYWxzZVwiIH0sIHsgXCJuYW1lXCI6IFwiamF2YV9nZW5lcmljX3NlcnZpY2VzXCIsIFwibnVtYmVyXCI6IDE3LCBcInR5cGVcIjogOCwgXCJsYWJlbFwiOiAxLCBcImRlZmF1bHRWYWx1ZVwiOiBcImZhbHNlXCIgfSwgeyBcIm5hbWVcIjogXCJweV9nZW5lcmljX3NlcnZpY2VzXCIsIFwibnVtYmVyXCI6IDE4LCBcInR5cGVcIjogOCwgXCJsYWJlbFwiOiAxLCBcImRlZmF1bHRWYWx1ZVwiOiBcImZhbHNlXCIgfSwgeyBcIm5hbWVcIjogXCJkZXByZWNhdGVkXCIsIFwibnVtYmVyXCI6IDIzLCBcInR5cGVcIjogOCwgXCJsYWJlbFwiOiAxLCBcImRlZmF1bHRWYWx1ZVwiOiBcImZhbHNlXCIgfSwgeyBcIm5hbWVcIjogXCJjY19lbmFibGVfYXJlbmFzXCIsIFwibnVtYmVyXCI6IDMxLCBcInR5cGVcIjogOCwgXCJsYWJlbFwiOiAxLCBcImRlZmF1bHRWYWx1ZVwiOiBcInRydWVcIiB9LCB7IFwibmFtZVwiOiBcIm9iamNfY2xhc3NfcHJlZml4XCIsIFwibnVtYmVyXCI6IDM2LCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiY3NoYXJwX25hbWVzcGFjZVwiLCBcIm51bWJlclwiOiAzNywgXCJ0eXBlXCI6IDksIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcInN3aWZ0X3ByZWZpeFwiLCBcIm51bWJlclwiOiAzOSwgXCJ0eXBlXCI6IDksIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcInBocF9jbGFzc19wcmVmaXhcIiwgXCJudW1iZXJcIjogNDAsIFwidHlwZVwiOiA5LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJwaHBfbmFtZXNwYWNlXCIsIFwibnVtYmVyXCI6IDQxLCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwicGhwX21ldGFkYXRhX25hbWVzcGFjZVwiLCBcIm51bWJlclwiOiA0NCwgXCJ0eXBlXCI6IDksIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcInJ1YnlfcGFja2FnZVwiLCBcIm51bWJlclwiOiA0NSwgXCJ0eXBlXCI6IDksIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcImZlYXR1cmVzXCIsIFwibnVtYmVyXCI6IDUwLCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmVhdHVyZVNldFwiIH0sIHsgXCJuYW1lXCI6IFwidW5pbnRlcnByZXRlZF9vcHRpb25cIiwgXCJudW1iZXJcIjogOTk5LCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMywgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuVW5pbnRlcnByZXRlZE9wdGlvblwiIH1dLCBcImVudW1UeXBlXCI6IFt7IFwibmFtZVwiOiBcIk9wdGltaXplTW9kZVwiLCBcInZhbHVlXCI6IFt7IFwibmFtZVwiOiBcIlNQRUVEXCIsIFwibnVtYmVyXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJDT0RFX1NJWkVcIiwgXCJudW1iZXJcIjogMiB9LCB7IFwibmFtZVwiOiBcIkxJVEVfUlVOVElNRVwiLCBcIm51bWJlclwiOiAzIH1dIH1dLCBcImV4dGVuc2lvblJhbmdlXCI6IFt7IFwic3RhcnRcIjogMTAwMCwgXCJlbmRcIjogNTM2ODcwOTEyIH1dIH0sIHsgXCJuYW1lXCI6IFwiTWVzc2FnZU9wdGlvbnNcIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJtZXNzYWdlX3NldF93aXJlX2Zvcm1hdFwiLCBcIm51bWJlclwiOiAxLCBcInR5cGVcIjogOCwgXCJsYWJlbFwiOiAxLCBcImRlZmF1bHRWYWx1ZVwiOiBcImZhbHNlXCIgfSwgeyBcIm5hbWVcIjogXCJub19zdGFuZGFyZF9kZXNjcmlwdG9yX2FjY2Vzc29yXCIsIFwibnVtYmVyXCI6IDIsIFwidHlwZVwiOiA4LCBcImxhYmVsXCI6IDEsIFwiZGVmYXVsdFZhbHVlXCI6IFwiZmFsc2VcIiB9LCB7IFwibmFtZVwiOiBcImRlcHJlY2F0ZWRcIiwgXCJudW1iZXJcIjogMywgXCJ0eXBlXCI6IDgsIFwibGFiZWxcIjogMSwgXCJkZWZhdWx0VmFsdWVcIjogXCJmYWxzZVwiIH0sIHsgXCJuYW1lXCI6IFwibWFwX2VudHJ5XCIsIFwibnVtYmVyXCI6IDcsIFwidHlwZVwiOiA4LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJkZXByZWNhdGVkX2xlZ2FjeV9qc29uX2ZpZWxkX2NvbmZsaWN0c1wiLCBcIm51bWJlclwiOiAxMSwgXCJ0eXBlXCI6IDgsIFwibGFiZWxcIjogMSwgXCJvcHRpb25zXCI6IHsgXCJkZXByZWNhdGVkXCI6IHRydWUgfSB9LCB7IFwibmFtZVwiOiBcImZlYXR1cmVzXCIsIFwibnVtYmVyXCI6IDEyLCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmVhdHVyZVNldFwiIH0sIHsgXCJuYW1lXCI6IFwidW5pbnRlcnByZXRlZF9vcHRpb25cIiwgXCJudW1iZXJcIjogOTk5LCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMywgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuVW5pbnRlcnByZXRlZE9wdGlvblwiIH1dLCBcImV4dGVuc2lvblJhbmdlXCI6IFt7IFwic3RhcnRcIjogMTAwMCwgXCJlbmRcIjogNTM2ODcwOTEyIH1dIH0sIHsgXCJuYW1lXCI6IFwiRmllbGRPcHRpb25zXCIsIFwiZmllbGRcIjogW3sgXCJuYW1lXCI6IFwiY3R5cGVcIiwgXCJudW1iZXJcIjogMSwgXCJ0eXBlXCI6IDE0LCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZpZWxkT3B0aW9ucy5DVHlwZVwiLCBcImRlZmF1bHRWYWx1ZVwiOiBcIlNUUklOR1wiIH0sIHsgXCJuYW1lXCI6IFwicGFja2VkXCIsIFwibnVtYmVyXCI6IDIsIFwidHlwZVwiOiA4LCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJqc3R5cGVcIiwgXCJudW1iZXJcIjogNiwgXCJ0eXBlXCI6IDE0LCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZpZWxkT3B0aW9ucy5KU1R5cGVcIiwgXCJkZWZhdWx0VmFsdWVcIjogXCJKU19OT1JNQUxcIiB9LCB7IFwibmFtZVwiOiBcImxhenlcIiwgXCJudW1iZXJcIjogNSwgXCJ0eXBlXCI6IDgsIFwibGFiZWxcIjogMSwgXCJkZWZhdWx0VmFsdWVcIjogXCJmYWxzZVwiIH0sIHsgXCJuYW1lXCI6IFwidW52ZXJpZmllZF9sYXp5XCIsIFwibnVtYmVyXCI6IDE1LCBcInR5cGVcIjogOCwgXCJsYWJlbFwiOiAxLCBcImRlZmF1bHRWYWx1ZVwiOiBcImZhbHNlXCIgfSwgeyBcIm5hbWVcIjogXCJkZXByZWNhdGVkXCIsIFwibnVtYmVyXCI6IDMsIFwidHlwZVwiOiA4LCBcImxhYmVsXCI6IDEsIFwiZGVmYXVsdFZhbHVlXCI6IFwiZmFsc2VcIiB9LCB7IFwibmFtZVwiOiBcIndlYWtcIiwgXCJudW1iZXJcIjogMTAsIFwidHlwZVwiOiA4LCBcImxhYmVsXCI6IDEsIFwiZGVmYXVsdFZhbHVlXCI6IFwiZmFsc2VcIiwgXCJvcHRpb25zXCI6IHsgXCJkZXByZWNhdGVkXCI6IHRydWUgfSB9LCB7IFwibmFtZVwiOiBcImRlYnVnX3JlZGFjdFwiLCBcIm51bWJlclwiOiAxNiwgXCJ0eXBlXCI6IDgsIFwibGFiZWxcIjogMSwgXCJkZWZhdWx0VmFsdWVcIjogXCJmYWxzZVwiIH0sIHsgXCJuYW1lXCI6IFwicmV0ZW50aW9uXCIsIFwibnVtYmVyXCI6IDE3LCBcInR5cGVcIjogMTQsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmllbGRPcHRpb25zLk9wdGlvblJldGVudGlvblwiIH0sIHsgXCJuYW1lXCI6IFwidGFyZ2V0c1wiLCBcIm51bWJlclwiOiAxOSwgXCJ0eXBlXCI6IDE0LCBcImxhYmVsXCI6IDMsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZpZWxkT3B0aW9ucy5PcHRpb25UYXJnZXRUeXBlXCIgfSwgeyBcIm5hbWVcIjogXCJlZGl0aW9uX2RlZmF1bHRzXCIsIFwibnVtYmVyXCI6IDIwLCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMywgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmllbGRPcHRpb25zLkVkaXRpb25EZWZhdWx0XCIgfSwgeyBcIm5hbWVcIjogXCJmZWF0dXJlc1wiLCBcIm51bWJlclwiOiAyMSwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXRcIiB9LCB7IFwibmFtZVwiOiBcImZlYXR1cmVfc3VwcG9ydFwiLCBcIm51bWJlclwiOiAyMiwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZpZWxkT3B0aW9ucy5GZWF0dXJlU3VwcG9ydFwiIH0sIHsgXCJuYW1lXCI6IFwidW5pbnRlcnByZXRlZF9vcHRpb25cIiwgXCJudW1iZXJcIjogOTk5LCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMywgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuVW5pbnRlcnByZXRlZE9wdGlvblwiIH1dLCBcIm5lc3RlZFR5cGVcIjogW3sgXCJuYW1lXCI6IFwiRWRpdGlvbkRlZmF1bHRcIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJlZGl0aW9uXCIsIFwibnVtYmVyXCI6IDMsIFwidHlwZVwiOiAxNCwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5FZGl0aW9uXCIgfSwgeyBcIm5hbWVcIjogXCJ2YWx1ZVwiLCBcIm51bWJlclwiOiAyLCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH1dIH0sIHsgXCJuYW1lXCI6IFwiRmVhdHVyZVN1cHBvcnRcIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJlZGl0aW9uX2ludHJvZHVjZWRcIiwgXCJudW1iZXJcIjogMSwgXCJ0eXBlXCI6IDE0LCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkVkaXRpb25cIiB9LCB7IFwibmFtZVwiOiBcImVkaXRpb25fZGVwcmVjYXRlZFwiLCBcIm51bWJlclwiOiAyLCBcInR5cGVcIjogMTQsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRWRpdGlvblwiIH0sIHsgXCJuYW1lXCI6IFwiZGVwcmVjYXRpb25fd2FybmluZ1wiLCBcIm51bWJlclwiOiAzLCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiZWRpdGlvbl9yZW1vdmVkXCIsIFwibnVtYmVyXCI6IDQsIFwidHlwZVwiOiAxNCwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5FZGl0aW9uXCIgfV0gfV0sIFwiZW51bVR5cGVcIjogW3sgXCJuYW1lXCI6IFwiQ1R5cGVcIiwgXCJ2YWx1ZVwiOiBbeyBcIm5hbWVcIjogXCJTVFJJTkdcIiwgXCJudW1iZXJcIjogMCB9LCB7IFwibmFtZVwiOiBcIkNPUkRcIiwgXCJudW1iZXJcIjogMSB9LCB7IFwibmFtZVwiOiBcIlNUUklOR19QSUVDRVwiLCBcIm51bWJlclwiOiAyIH1dIH0sIHsgXCJuYW1lXCI6IFwiSlNUeXBlXCIsIFwidmFsdWVcIjogW3sgXCJuYW1lXCI6IFwiSlNfTk9STUFMXCIsIFwibnVtYmVyXCI6IDAgfSwgeyBcIm5hbWVcIjogXCJKU19TVFJJTkdcIiwgXCJudW1iZXJcIjogMSB9LCB7IFwibmFtZVwiOiBcIkpTX05VTUJFUlwiLCBcIm51bWJlclwiOiAyIH1dIH0sIHsgXCJuYW1lXCI6IFwiT3B0aW9uUmV0ZW50aW9uXCIsIFwidmFsdWVcIjogW3sgXCJuYW1lXCI6IFwiUkVURU5USU9OX1VOS05PV05cIiwgXCJudW1iZXJcIjogMCB9LCB7IFwibmFtZVwiOiBcIlJFVEVOVElPTl9SVU5USU1FXCIsIFwibnVtYmVyXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJSRVRFTlRJT05fU09VUkNFXCIsIFwibnVtYmVyXCI6IDIgfV0gfSwgeyBcIm5hbWVcIjogXCJPcHRpb25UYXJnZXRUeXBlXCIsIFwidmFsdWVcIjogW3sgXCJuYW1lXCI6IFwiVEFSR0VUX1RZUEVfVU5LTk9XTlwiLCBcIm51bWJlclwiOiAwIH0sIHsgXCJuYW1lXCI6IFwiVEFSR0VUX1RZUEVfRklMRVwiLCBcIm51bWJlclwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiVEFSR0VUX1RZUEVfRVhURU5TSU9OX1JBTkdFXCIsIFwibnVtYmVyXCI6IDIgfSwgeyBcIm5hbWVcIjogXCJUQVJHRVRfVFlQRV9NRVNTQUdFXCIsIFwibnVtYmVyXCI6IDMgfSwgeyBcIm5hbWVcIjogXCJUQVJHRVRfVFlQRV9GSUVMRFwiLCBcIm51bWJlclwiOiA0IH0sIHsgXCJuYW1lXCI6IFwiVEFSR0VUX1RZUEVfT05FT0ZcIiwgXCJudW1iZXJcIjogNSB9LCB7IFwibmFtZVwiOiBcIlRBUkdFVF9UWVBFX0VOVU1cIiwgXCJudW1iZXJcIjogNiB9LCB7IFwibmFtZVwiOiBcIlRBUkdFVF9UWVBFX0VOVU1fRU5UUllcIiwgXCJudW1iZXJcIjogNyB9LCB7IFwibmFtZVwiOiBcIlRBUkdFVF9UWVBFX1NFUlZJQ0VcIiwgXCJudW1iZXJcIjogOCB9LCB7IFwibmFtZVwiOiBcIlRBUkdFVF9UWVBFX01FVEhPRFwiLCBcIm51bWJlclwiOiA5IH1dIH1dLCBcImV4dGVuc2lvblJhbmdlXCI6IFt7IFwic3RhcnRcIjogMTAwMCwgXCJlbmRcIjogNTM2ODcwOTEyIH1dIH0sIHsgXCJuYW1lXCI6IFwiT25lb2ZPcHRpb25zXCIsIFwiZmllbGRcIjogW3sgXCJuYW1lXCI6IFwiZmVhdHVyZXNcIiwgXCJudW1iZXJcIjogMSwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXRcIiB9LCB7IFwibmFtZVwiOiBcInVuaW50ZXJwcmV0ZWRfb3B0aW9uXCIsIFwibnVtYmVyXCI6IDk5OSwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDMsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLlVuaW50ZXJwcmV0ZWRPcHRpb25cIiB9XSwgXCJleHRlbnNpb25SYW5nZVwiOiBbeyBcInN0YXJ0XCI6IDEwMDAsIFwiZW5kXCI6IDUzNjg3MDkxMiB9XSB9LCB7IFwibmFtZVwiOiBcIkVudW1PcHRpb25zXCIsIFwiZmllbGRcIjogW3sgXCJuYW1lXCI6IFwiYWxsb3dfYWxpYXNcIiwgXCJudW1iZXJcIjogMiwgXCJ0eXBlXCI6IDgsIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcImRlcHJlY2F0ZWRcIiwgXCJudW1iZXJcIjogMywgXCJ0eXBlXCI6IDgsIFwibGFiZWxcIjogMSwgXCJkZWZhdWx0VmFsdWVcIjogXCJmYWxzZVwiIH0sIHsgXCJuYW1lXCI6IFwiZGVwcmVjYXRlZF9sZWdhY3lfanNvbl9maWVsZF9jb25mbGljdHNcIiwgXCJudW1iZXJcIjogNiwgXCJ0eXBlXCI6IDgsIFwibGFiZWxcIjogMSwgXCJvcHRpb25zXCI6IHsgXCJkZXByZWNhdGVkXCI6IHRydWUgfSB9LCB7IFwibmFtZVwiOiBcImZlYXR1cmVzXCIsIFwibnVtYmVyXCI6IDcsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0XCIgfSwgeyBcIm5hbWVcIjogXCJ1bmludGVycHJldGVkX29wdGlvblwiLCBcIm51bWJlclwiOiA5OTksIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAzLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5VbmludGVycHJldGVkT3B0aW9uXCIgfV0sIFwiZXh0ZW5zaW9uUmFuZ2VcIjogW3sgXCJzdGFydFwiOiAxMDAwLCBcImVuZFwiOiA1MzY4NzA5MTIgfV0gfSwgeyBcIm5hbWVcIjogXCJFbnVtVmFsdWVPcHRpb25zXCIsIFwiZmllbGRcIjogW3sgXCJuYW1lXCI6IFwiZGVwcmVjYXRlZFwiLCBcIm51bWJlclwiOiAxLCBcInR5cGVcIjogOCwgXCJsYWJlbFwiOiAxLCBcImRlZmF1bHRWYWx1ZVwiOiBcImZhbHNlXCIgfSwgeyBcIm5hbWVcIjogXCJmZWF0dXJlc1wiLCBcIm51bWJlclwiOiAyLCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmVhdHVyZVNldFwiIH0sIHsgXCJuYW1lXCI6IFwiZGVidWdfcmVkYWN0XCIsIFwibnVtYmVyXCI6IDMsIFwidHlwZVwiOiA4LCBcImxhYmVsXCI6IDEsIFwiZGVmYXVsdFZhbHVlXCI6IFwiZmFsc2VcIiB9LCB7IFwibmFtZVwiOiBcImZlYXR1cmVfc3VwcG9ydFwiLCBcIm51bWJlclwiOiA0LCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmllbGRPcHRpb25zLkZlYXR1cmVTdXBwb3J0XCIgfSwgeyBcIm5hbWVcIjogXCJ1bmludGVycHJldGVkX29wdGlvblwiLCBcIm51bWJlclwiOiA5OTksIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAzLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5VbmludGVycHJldGVkT3B0aW9uXCIgfV0sIFwiZXh0ZW5zaW9uUmFuZ2VcIjogW3sgXCJzdGFydFwiOiAxMDAwLCBcImVuZFwiOiA1MzY4NzA5MTIgfV0gfSwgeyBcIm5hbWVcIjogXCJTZXJ2aWNlT3B0aW9uc1wiLCBcImZpZWxkXCI6IFt7IFwibmFtZVwiOiBcImZlYXR1cmVzXCIsIFwibnVtYmVyXCI6IDM0LCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRmVhdHVyZVNldFwiIH0sIHsgXCJuYW1lXCI6IFwiZGVwcmVjYXRlZFwiLCBcIm51bWJlclwiOiAzMywgXCJ0eXBlXCI6IDgsIFwibGFiZWxcIjogMSwgXCJkZWZhdWx0VmFsdWVcIjogXCJmYWxzZVwiIH0sIHsgXCJuYW1lXCI6IFwidW5pbnRlcnByZXRlZF9vcHRpb25cIiwgXCJudW1iZXJcIjogOTk5LCBcInR5cGVcIjogMTEsIFwibGFiZWxcIjogMywgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuVW5pbnRlcnByZXRlZE9wdGlvblwiIH1dLCBcImV4dGVuc2lvblJhbmdlXCI6IFt7IFwic3RhcnRcIjogMTAwMCwgXCJlbmRcIjogNTM2ODcwOTEyIH1dIH0sIHsgXCJuYW1lXCI6IFwiTWV0aG9kT3B0aW9uc1wiLCBcImZpZWxkXCI6IFt7IFwibmFtZVwiOiBcImRlcHJlY2F0ZWRcIiwgXCJudW1iZXJcIjogMzMsIFwidHlwZVwiOiA4LCBcImxhYmVsXCI6IDEsIFwiZGVmYXVsdFZhbHVlXCI6IFwiZmFsc2VcIiB9LCB7IFwibmFtZVwiOiBcImlkZW1wb3RlbmN5X2xldmVsXCIsIFwibnVtYmVyXCI6IDM0LCBcInR5cGVcIjogMTQsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuTWV0aG9kT3B0aW9ucy5JZGVtcG90ZW5jeUxldmVsXCIsIFwiZGVmYXVsdFZhbHVlXCI6IFwiSURFTVBPVEVOQ1lfVU5LTk9XTlwiIH0sIHsgXCJuYW1lXCI6IFwiZmVhdHVyZXNcIiwgXCJudW1iZXJcIjogMzUsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0XCIgfSwgeyBcIm5hbWVcIjogXCJ1bmludGVycHJldGVkX29wdGlvblwiLCBcIm51bWJlclwiOiA5OTksIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAzLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5VbmludGVycHJldGVkT3B0aW9uXCIgfV0sIFwiZW51bVR5cGVcIjogW3sgXCJuYW1lXCI6IFwiSWRlbXBvdGVuY3lMZXZlbFwiLCBcInZhbHVlXCI6IFt7IFwibmFtZVwiOiBcIklERU1QT1RFTkNZX1VOS05PV05cIiwgXCJudW1iZXJcIjogMCB9LCB7IFwibmFtZVwiOiBcIk5PX1NJREVfRUZGRUNUU1wiLCBcIm51bWJlclwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiSURFTVBPVEVOVFwiLCBcIm51bWJlclwiOiAyIH1dIH1dLCBcImV4dGVuc2lvblJhbmdlXCI6IFt7IFwic3RhcnRcIjogMTAwMCwgXCJlbmRcIjogNTM2ODcwOTEyIH1dIH0sIHsgXCJuYW1lXCI6IFwiVW5pbnRlcnByZXRlZE9wdGlvblwiLCBcImZpZWxkXCI6IFt7IFwibmFtZVwiOiBcIm5hbWVcIiwgXCJudW1iZXJcIjogMiwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDMsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLlVuaW50ZXJwcmV0ZWRPcHRpb24uTmFtZVBhcnRcIiB9LCB7IFwibmFtZVwiOiBcImlkZW50aWZpZXJfdmFsdWVcIiwgXCJudW1iZXJcIjogMywgXCJ0eXBlXCI6IDksIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcInBvc2l0aXZlX2ludF92YWx1ZVwiLCBcIm51bWJlclwiOiA0LCBcInR5cGVcIjogNCwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwibmVnYXRpdmVfaW50X3ZhbHVlXCIsIFwibnVtYmVyXCI6IDUsIFwidHlwZVwiOiAzLCBcImxhYmVsXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJkb3VibGVfdmFsdWVcIiwgXCJudW1iZXJcIjogNiwgXCJ0eXBlXCI6IDEsIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcInN0cmluZ192YWx1ZVwiLCBcIm51bWJlclwiOiA3LCBcInR5cGVcIjogMTIsIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcImFnZ3JlZ2F0ZV92YWx1ZVwiLCBcIm51bWJlclwiOiA4LCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH1dLCBcIm5lc3RlZFR5cGVcIjogW3sgXCJuYW1lXCI6IFwiTmFtZVBhcnRcIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJuYW1lX3BhcnRcIiwgXCJudW1iZXJcIjogMSwgXCJ0eXBlXCI6IDksIFwibGFiZWxcIjogMiB9LCB7IFwibmFtZVwiOiBcImlzX2V4dGVuc2lvblwiLCBcIm51bWJlclwiOiAyLCBcInR5cGVcIjogOCwgXCJsYWJlbFwiOiAyIH1dIH1dIH0sIHsgXCJuYW1lXCI6IFwiRmVhdHVyZVNldFwiLCBcImZpZWxkXCI6IFt7IFwibmFtZVwiOiBcImZpZWxkX3ByZXNlbmNlXCIsIFwibnVtYmVyXCI6IDEsIFwidHlwZVwiOiAxNCwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LkZpZWxkUHJlc2VuY2VcIiwgXCJvcHRpb25zXCI6IHsgXCJyZXRlbnRpb25cIjogMSwgXCJ0YXJnZXRzXCI6IFs0LCAxXSwgXCJlZGl0aW9uRGVmYXVsdHNcIjogW3sgXCJ2YWx1ZVwiOiBcIkVYUExJQ0lUXCIsIFwiZWRpdGlvblwiOiA5MDAgfSwgeyBcInZhbHVlXCI6IFwiSU1QTElDSVRcIiwgXCJlZGl0aW9uXCI6IDk5OSB9LCB7IFwidmFsdWVcIjogXCJFWFBMSUNJVFwiLCBcImVkaXRpb25cIjogMTAwMCB9XSB9IH0sIHsgXCJuYW1lXCI6IFwiZW51bV90eXBlXCIsIFwibnVtYmVyXCI6IDIsIFwidHlwZVwiOiAxNCwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LkVudW1UeXBlXCIsIFwib3B0aW9uc1wiOiB7IFwicmV0ZW50aW9uXCI6IDEsIFwidGFyZ2V0c1wiOiBbNiwgMV0sIFwiZWRpdGlvbkRlZmF1bHRzXCI6IFt7IFwidmFsdWVcIjogXCJDTE9TRURcIiwgXCJlZGl0aW9uXCI6IDkwMCB9LCB7IFwidmFsdWVcIjogXCJPUEVOXCIsIFwiZWRpdGlvblwiOiA5OTkgfV0gfSB9LCB7IFwibmFtZVwiOiBcInJlcGVhdGVkX2ZpZWxkX2VuY29kaW5nXCIsIFwibnVtYmVyXCI6IDMsIFwidHlwZVwiOiAxNCwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LlJlcGVhdGVkRmllbGRFbmNvZGluZ1wiLCBcIm9wdGlvbnNcIjogeyBcInJldGVudGlvblwiOiAxLCBcInRhcmdldHNcIjogWzQsIDFdLCBcImVkaXRpb25EZWZhdWx0c1wiOiBbeyBcInZhbHVlXCI6IFwiRVhQQU5ERURcIiwgXCJlZGl0aW9uXCI6IDkwMCB9LCB7IFwidmFsdWVcIjogXCJQQUNLRURcIiwgXCJlZGl0aW9uXCI6IDk5OSB9XSB9IH0sIHsgXCJuYW1lXCI6IFwidXRmOF92YWxpZGF0aW9uXCIsIFwibnVtYmVyXCI6IDQsIFwidHlwZVwiOiAxNCwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LlV0ZjhWYWxpZGF0aW9uXCIsIFwib3B0aW9uc1wiOiB7IFwicmV0ZW50aW9uXCI6IDEsIFwidGFyZ2V0c1wiOiBbNCwgMV0sIFwiZWRpdGlvbkRlZmF1bHRzXCI6IFt7IFwidmFsdWVcIjogXCJOT05FXCIsIFwiZWRpdGlvblwiOiA5MDAgfSwgeyBcInZhbHVlXCI6IFwiVkVSSUZZXCIsIFwiZWRpdGlvblwiOiA5OTkgfV0gfSB9LCB7IFwibmFtZVwiOiBcIm1lc3NhZ2VfZW5jb2RpbmdcIiwgXCJudW1iZXJcIjogNSwgXCJ0eXBlXCI6IDE0LCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXQuTWVzc2FnZUVuY29kaW5nXCIsIFwib3B0aW9uc1wiOiB7IFwicmV0ZW50aW9uXCI6IDEsIFwidGFyZ2V0c1wiOiBbNCwgMV0sIFwiZWRpdGlvbkRlZmF1bHRzXCI6IFt7IFwidmFsdWVcIjogXCJMRU5HVEhfUFJFRklYRURcIiwgXCJlZGl0aW9uXCI6IDkwMCB9XSB9IH0sIHsgXCJuYW1lXCI6IFwianNvbl9mb3JtYXRcIiwgXCJudW1iZXJcIjogNiwgXCJ0eXBlXCI6IDE0LCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXQuSnNvbkZvcm1hdFwiLCBcIm9wdGlvbnNcIjogeyBcInJldGVudGlvblwiOiAxLCBcInRhcmdldHNcIjogWzMsIDYsIDFdLCBcImVkaXRpb25EZWZhdWx0c1wiOiBbeyBcInZhbHVlXCI6IFwiTEVHQUNZX0JFU1RfRUZGT1JUXCIsIFwiZWRpdGlvblwiOiA5MDAgfSwgeyBcInZhbHVlXCI6IFwiQUxMT1dcIiwgXCJlZGl0aW9uXCI6IDk5OSB9XSB9IH0sIHsgXCJuYW1lXCI6IFwiZW5mb3JjZV9uYW1pbmdfc3R5bGVcIiwgXCJudW1iZXJcIjogNywgXCJ0eXBlXCI6IDE0LCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXQuRW5mb3JjZU5hbWluZ1N0eWxlXCIsIFwib3B0aW9uc1wiOiB7IFwicmV0ZW50aW9uXCI6IDIsIFwidGFyZ2V0c1wiOiBbMSwgMiwgMywgNCwgNSwgNiwgNywgOCwgOV0sIFwiZWRpdGlvbkRlZmF1bHRzXCI6IFt7IFwidmFsdWVcIjogXCJTVFlMRV9MRUdBQ1lcIiwgXCJlZGl0aW9uXCI6IDkwMCB9LCB7IFwidmFsdWVcIjogXCJTVFlMRTIwMjRcIiwgXCJlZGl0aW9uXCI6IDEwMDEgfV0gfSB9LCB7IFwibmFtZVwiOiBcImRlZmF1bHRfc3ltYm9sX3Zpc2liaWxpdHlcIiwgXCJudW1iZXJcIjogOCwgXCJ0eXBlXCI6IDE0LCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXQuVmlzaWJpbGl0eUZlYXR1cmUuRGVmYXVsdFN5bWJvbFZpc2liaWxpdHlcIiwgXCJvcHRpb25zXCI6IHsgXCJyZXRlbnRpb25cIjogMiwgXCJ0YXJnZXRzXCI6IFsxXSwgXCJlZGl0aW9uRGVmYXVsdHNcIjogW3sgXCJ2YWx1ZVwiOiBcIkVYUE9SVF9BTExcIiwgXCJlZGl0aW9uXCI6IDkwMCB9LCB7IFwidmFsdWVcIjogXCJFWFBPUlRfVE9QX0xFVkVMXCIsIFwiZWRpdGlvblwiOiAxMDAxIH1dIH0gfV0sIFwibmVzdGVkVHlwZVwiOiBbeyBcIm5hbWVcIjogXCJWaXNpYmlsaXR5RmVhdHVyZVwiLCBcImVudW1UeXBlXCI6IFt7IFwibmFtZVwiOiBcIkRlZmF1bHRTeW1ib2xWaXNpYmlsaXR5XCIsIFwidmFsdWVcIjogW3sgXCJuYW1lXCI6IFwiREVGQVVMVF9TWU1CT0xfVklTSUJJTElUWV9VTktOT1dOXCIsIFwibnVtYmVyXCI6IDAgfSwgeyBcIm5hbWVcIjogXCJFWFBPUlRfQUxMXCIsIFwibnVtYmVyXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJFWFBPUlRfVE9QX0xFVkVMXCIsIFwibnVtYmVyXCI6IDIgfSwgeyBcIm5hbWVcIjogXCJMT0NBTF9BTExcIiwgXCJudW1iZXJcIjogMyB9LCB7IFwibmFtZVwiOiBcIlNUUklDVFwiLCBcIm51bWJlclwiOiA0IH1dIH1dIH1dLCBcImVudW1UeXBlXCI6IFt7IFwibmFtZVwiOiBcIkZpZWxkUHJlc2VuY2VcIiwgXCJ2YWx1ZVwiOiBbeyBcIm5hbWVcIjogXCJGSUVMRF9QUkVTRU5DRV9VTktOT1dOXCIsIFwibnVtYmVyXCI6IDAgfSwgeyBcIm5hbWVcIjogXCJFWFBMSUNJVFwiLCBcIm51bWJlclwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiSU1QTElDSVRcIiwgXCJudW1iZXJcIjogMiB9LCB7IFwibmFtZVwiOiBcIkxFR0FDWV9SRVFVSVJFRFwiLCBcIm51bWJlclwiOiAzIH1dIH0sIHsgXCJuYW1lXCI6IFwiRW51bVR5cGVcIiwgXCJ2YWx1ZVwiOiBbeyBcIm5hbWVcIjogXCJFTlVNX1RZUEVfVU5LTk9XTlwiLCBcIm51bWJlclwiOiAwIH0sIHsgXCJuYW1lXCI6IFwiT1BFTlwiLCBcIm51bWJlclwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiQ0xPU0VEXCIsIFwibnVtYmVyXCI6IDIgfV0gfSwgeyBcIm5hbWVcIjogXCJSZXBlYXRlZEZpZWxkRW5jb2RpbmdcIiwgXCJ2YWx1ZVwiOiBbeyBcIm5hbWVcIjogXCJSRVBFQVRFRF9GSUVMRF9FTkNPRElOR19VTktOT1dOXCIsIFwibnVtYmVyXCI6IDAgfSwgeyBcIm5hbWVcIjogXCJQQUNLRURcIiwgXCJudW1iZXJcIjogMSB9LCB7IFwibmFtZVwiOiBcIkVYUEFOREVEXCIsIFwibnVtYmVyXCI6IDIgfV0gfSwgeyBcIm5hbWVcIjogXCJVdGY4VmFsaWRhdGlvblwiLCBcInZhbHVlXCI6IFt7IFwibmFtZVwiOiBcIlVURjhfVkFMSURBVElPTl9VTktOT1dOXCIsIFwibnVtYmVyXCI6IDAgfSwgeyBcIm5hbWVcIjogXCJWRVJJRllcIiwgXCJudW1iZXJcIjogMiB9LCB7IFwibmFtZVwiOiBcIk5PTkVcIiwgXCJudW1iZXJcIjogMyB9XSB9LCB7IFwibmFtZVwiOiBcIk1lc3NhZ2VFbmNvZGluZ1wiLCBcInZhbHVlXCI6IFt7IFwibmFtZVwiOiBcIk1FU1NBR0VfRU5DT0RJTkdfVU5LTk9XTlwiLCBcIm51bWJlclwiOiAwIH0sIHsgXCJuYW1lXCI6IFwiTEVOR1RIX1BSRUZJWEVEXCIsIFwibnVtYmVyXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJERUxJTUlURURcIiwgXCJudW1iZXJcIjogMiB9XSB9LCB7IFwibmFtZVwiOiBcIkpzb25Gb3JtYXRcIiwgXCJ2YWx1ZVwiOiBbeyBcIm5hbWVcIjogXCJKU09OX0ZPUk1BVF9VTktOT1dOXCIsIFwibnVtYmVyXCI6IDAgfSwgeyBcIm5hbWVcIjogXCJBTExPV1wiLCBcIm51bWJlclwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiTEVHQUNZX0JFU1RfRUZGT1JUXCIsIFwibnVtYmVyXCI6IDIgfV0gfSwgeyBcIm5hbWVcIjogXCJFbmZvcmNlTmFtaW5nU3R5bGVcIiwgXCJ2YWx1ZVwiOiBbeyBcIm5hbWVcIjogXCJFTkZPUkNFX05BTUlOR19TVFlMRV9VTktOT1dOXCIsIFwibnVtYmVyXCI6IDAgfSwgeyBcIm5hbWVcIjogXCJTVFlMRTIwMjRcIiwgXCJudW1iZXJcIjogMSB9LCB7IFwibmFtZVwiOiBcIlNUWUxFX0xFR0FDWVwiLCBcIm51bWJlclwiOiAyIH1dIH1dLCBcImV4dGVuc2lvblJhbmdlXCI6IFt7IFwic3RhcnRcIjogMTAwMCwgXCJlbmRcIjogOTk5NSB9LCB7IFwic3RhcnRcIjogOTk5NSwgXCJlbmRcIjogMTAwMDAgfSwgeyBcInN0YXJ0XCI6IDEwMDAwLCBcImVuZFwiOiAxMDAwMSB9XSB9LCB7IFwibmFtZVwiOiBcIkZlYXR1cmVTZXREZWZhdWx0c1wiLCBcImZpZWxkXCI6IFt7IFwibmFtZVwiOiBcImRlZmF1bHRzXCIsIFwibnVtYmVyXCI6IDEsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAzLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0RGVmYXVsdHMuRmVhdHVyZVNldEVkaXRpb25EZWZhdWx0XCIgfSwgeyBcIm5hbWVcIjogXCJtaW5pbXVtX2VkaXRpb25cIiwgXCJudW1iZXJcIjogNCwgXCJ0eXBlXCI6IDE0LCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkVkaXRpb25cIiB9LCB7IFwibmFtZVwiOiBcIm1heGltdW1fZWRpdGlvblwiLCBcIm51bWJlclwiOiA1LCBcInR5cGVcIjogMTQsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRWRpdGlvblwiIH1dLCBcIm5lc3RlZFR5cGVcIjogW3sgXCJuYW1lXCI6IFwiRmVhdHVyZVNldEVkaXRpb25EZWZhdWx0XCIsIFwiZmllbGRcIjogW3sgXCJuYW1lXCI6IFwiZWRpdGlvblwiLCBcIm51bWJlclwiOiAzLCBcInR5cGVcIjogMTQsIFwibGFiZWxcIjogMSwgXCJ0eXBlTmFtZVwiOiBcIi5nb29nbGUucHJvdG9idWYuRWRpdGlvblwiIH0sIHsgXCJuYW1lXCI6IFwib3ZlcnJpZGFibGVfZmVhdHVyZXNcIiwgXCJudW1iZXJcIjogNCwgXCJ0eXBlXCI6IDExLCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXRcIiB9LCB7IFwibmFtZVwiOiBcImZpeGVkX2ZlYXR1cmVzXCIsIFwibnVtYmVyXCI6IDUsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAxLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0XCIgfV0gfV0gfSwgeyBcIm5hbWVcIjogXCJTb3VyY2VDb2RlSW5mb1wiLCBcImZpZWxkXCI6IFt7IFwibmFtZVwiOiBcImxvY2F0aW9uXCIsIFwibnVtYmVyXCI6IDEsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAzLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5Tb3VyY2VDb2RlSW5mby5Mb2NhdGlvblwiIH1dLCBcIm5lc3RlZFR5cGVcIjogW3sgXCJuYW1lXCI6IFwiTG9jYXRpb25cIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJwYXRoXCIsIFwibnVtYmVyXCI6IDEsIFwidHlwZVwiOiA1LCBcImxhYmVsXCI6IDMsIFwib3B0aW9uc1wiOiB7IFwicGFja2VkXCI6IHRydWUgfSB9LCB7IFwibmFtZVwiOiBcInNwYW5cIiwgXCJudW1iZXJcIjogMiwgXCJ0eXBlXCI6IDUsIFwibGFiZWxcIjogMywgXCJvcHRpb25zXCI6IHsgXCJwYWNrZWRcIjogdHJ1ZSB9IH0sIHsgXCJuYW1lXCI6IFwibGVhZGluZ19jb21tZW50c1wiLCBcIm51bWJlclwiOiAzLCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwidHJhaWxpbmdfY29tbWVudHNcIiwgXCJudW1iZXJcIjogNCwgXCJ0eXBlXCI6IDksIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcImxlYWRpbmdfZGV0YWNoZWRfY29tbWVudHNcIiwgXCJudW1iZXJcIjogNiwgXCJ0eXBlXCI6IDksIFwibGFiZWxcIjogMyB9XSB9XSwgXCJleHRlbnNpb25SYW5nZVwiOiBbeyBcInN0YXJ0XCI6IDUzNjAwMDAwMCwgXCJlbmRcIjogNTM2MDAwMDAxIH1dIH0sIHsgXCJuYW1lXCI6IFwiR2VuZXJhdGVkQ29kZUluZm9cIiwgXCJmaWVsZFwiOiBbeyBcIm5hbWVcIjogXCJhbm5vdGF0aW9uXCIsIFwibnVtYmVyXCI6IDEsIFwidHlwZVwiOiAxMSwgXCJsYWJlbFwiOiAzLCBcInR5cGVOYW1lXCI6IFwiLmdvb2dsZS5wcm90b2J1Zi5HZW5lcmF0ZWRDb2RlSW5mby5Bbm5vdGF0aW9uXCIgfV0sIFwibmVzdGVkVHlwZVwiOiBbeyBcIm5hbWVcIjogXCJBbm5vdGF0aW9uXCIsIFwiZmllbGRcIjogW3sgXCJuYW1lXCI6IFwicGF0aFwiLCBcIm51bWJlclwiOiAxLCBcInR5cGVcIjogNSwgXCJsYWJlbFwiOiAzLCBcIm9wdGlvbnNcIjogeyBcInBhY2tlZFwiOiB0cnVlIH0gfSwgeyBcIm5hbWVcIjogXCJzb3VyY2VfZmlsZVwiLCBcIm51bWJlclwiOiAyLCBcInR5cGVcIjogOSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiYmVnaW5cIiwgXCJudW1iZXJcIjogMywgXCJ0eXBlXCI6IDUsIFwibGFiZWxcIjogMSB9LCB7IFwibmFtZVwiOiBcImVuZFwiLCBcIm51bWJlclwiOiA0LCBcInR5cGVcIjogNSwgXCJsYWJlbFwiOiAxIH0sIHsgXCJuYW1lXCI6IFwic2VtYW50aWNcIiwgXCJudW1iZXJcIjogNSwgXCJ0eXBlXCI6IDE0LCBcImxhYmVsXCI6IDEsIFwidHlwZU5hbWVcIjogXCIuZ29vZ2xlLnByb3RvYnVmLkdlbmVyYXRlZENvZGVJbmZvLkFubm90YXRpb24uU2VtYW50aWNcIiB9XSwgXCJlbnVtVHlwZVwiOiBbeyBcIm5hbWVcIjogXCJTZW1hbnRpY1wiLCBcInZhbHVlXCI6IFt7IFwibmFtZVwiOiBcIk5PTkVcIiwgXCJudW1iZXJcIjogMCB9LCB7IFwibmFtZVwiOiBcIlNFVFwiLCBcIm51bWJlclwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiQUxJQVNcIiwgXCJudW1iZXJcIjogMiB9XSB9XSB9XSB9XSwgXCJlbnVtVHlwZVwiOiBbeyBcIm5hbWVcIjogXCJFZGl0aW9uXCIsIFwidmFsdWVcIjogW3sgXCJuYW1lXCI6IFwiRURJVElPTl9VTktOT1dOXCIsIFwibnVtYmVyXCI6IDAgfSwgeyBcIm5hbWVcIjogXCJFRElUSU9OX0xFR0FDWVwiLCBcIm51bWJlclwiOiA5MDAgfSwgeyBcIm5hbWVcIjogXCJFRElUSU9OX1BST1RPMlwiLCBcIm51bWJlclwiOiA5OTggfSwgeyBcIm5hbWVcIjogXCJFRElUSU9OX1BST1RPM1wiLCBcIm51bWJlclwiOiA5OTkgfSwgeyBcIm5hbWVcIjogXCJFRElUSU9OXzIwMjNcIiwgXCJudW1iZXJcIjogMTAwMCB9LCB7IFwibmFtZVwiOiBcIkVESVRJT05fMjAyNFwiLCBcIm51bWJlclwiOiAxMDAxIH0sIHsgXCJuYW1lXCI6IFwiRURJVElPTl8xX1RFU1RfT05MWVwiLCBcIm51bWJlclwiOiAxIH0sIHsgXCJuYW1lXCI6IFwiRURJVElPTl8yX1RFU1RfT05MWVwiLCBcIm51bWJlclwiOiAyIH0sIHsgXCJuYW1lXCI6IFwiRURJVElPTl85OTk5N19URVNUX09OTFlcIiwgXCJudW1iZXJcIjogOTk5OTcgfSwgeyBcIm5hbWVcIjogXCJFRElUSU9OXzk5OTk4X1RFU1RfT05MWVwiLCBcIm51bWJlclwiOiA5OTk5OCB9LCB7IFwibmFtZVwiOiBcIkVESVRJT05fOTk5OTlfVEVTVF9PTkxZXCIsIFwibnVtYmVyXCI6IDk5OTk5IH0sIHsgXCJuYW1lXCI6IFwiRURJVElPTl9NQVhcIiwgXCJudW1iZXJcIjogMjE0NzQ4MzY0NyB9XSB9LCB7IFwibmFtZVwiOiBcIlN5bWJvbFZpc2liaWxpdHlcIiwgXCJ2YWx1ZVwiOiBbeyBcIm5hbWVcIjogXCJWSVNJQklMSVRZX1VOU0VUXCIsIFwibnVtYmVyXCI6IDAgfSwgeyBcIm5hbWVcIjogXCJWSVNJQklMSVRZX0xPQ0FMXCIsIFwibnVtYmVyXCI6IDEgfSwgeyBcIm5hbWVcIjogXCJWSVNJQklMSVRZX0VYUE9SVFwiLCBcIm51bWJlclwiOiAyIH1dIH1dIH0pO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLkZpbGVEZXNjcmlwdG9yU2V0LlxuICogVXNlIGBjcmVhdGUoRmlsZURlc2NyaXB0b3JTZXRTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEZpbGVEZXNjcmlwdG9yU2V0U2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAwKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5GaWxlRGVzY3JpcHRvclByb3RvLlxuICogVXNlIGBjcmVhdGUoRmlsZURlc2NyaXB0b3JQcm90b1NjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgRmlsZURlc2NyaXB0b3JQcm90b1NjaGVtYSA9IC8qQF9fUFVSRV9fKi8gbWVzc2FnZURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMSk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBnb29nbGUucHJvdG9idWYuRGVzY3JpcHRvclByb3RvLlxuICogVXNlIGBjcmVhdGUoRGVzY3JpcHRvclByb3RvU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBEZXNjcmlwdG9yUHJvdG9TY2hlbWEgPSAvKkBfX1BVUkVfXyovIG1lc3NhZ2VEZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDIpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLkRlc2NyaXB0b3JQcm90by5FeHRlbnNpb25SYW5nZS5cbiAqIFVzZSBgY3JlYXRlKERlc2NyaXB0b3JQcm90b19FeHRlbnNpb25SYW5nZVNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgRGVzY3JpcHRvclByb3RvX0V4dGVuc2lvblJhbmdlU2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAyLCAwKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5EZXNjcmlwdG9yUHJvdG8uUmVzZXJ2ZWRSYW5nZS5cbiAqIFVzZSBgY3JlYXRlKERlc2NyaXB0b3JQcm90b19SZXNlcnZlZFJhbmdlU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBEZXNjcmlwdG9yUHJvdG9fUmVzZXJ2ZWRSYW5nZVNjaGVtYSA9IC8qQF9fUFVSRV9fKi8gbWVzc2FnZURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMiwgMSk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBnb29nbGUucHJvdG9idWYuRXh0ZW5zaW9uUmFuZ2VPcHRpb25zLlxuICogVXNlIGBjcmVhdGUoRXh0ZW5zaW9uUmFuZ2VPcHRpb25zU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBFeHRlbnNpb25SYW5nZU9wdGlvbnNTY2hlbWEgPSAvKkBfX1BVUkVfXyovIG1lc3NhZ2VEZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDMpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLkV4dGVuc2lvblJhbmdlT3B0aW9ucy5EZWNsYXJhdGlvbi5cbiAqIFVzZSBgY3JlYXRlKEV4dGVuc2lvblJhbmdlT3B0aW9uc19EZWNsYXJhdGlvblNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgRXh0ZW5zaW9uUmFuZ2VPcHRpb25zX0RlY2xhcmF0aW9uU2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAzLCAwKTtcbi8qKlxuICogVGhlIHZlcmlmaWNhdGlvbiBzdGF0ZSBvZiB0aGUgZXh0ZW5zaW9uIHJhbmdlLlxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5FeHRlbnNpb25SYW5nZU9wdGlvbnMuVmVyaWZpY2F0aW9uU3RhdGVcbiAqL1xuZXhwb3J0IHZhciBFeHRlbnNpb25SYW5nZU9wdGlvbnNfVmVyaWZpY2F0aW9uU3RhdGU7XG4oZnVuY3Rpb24gKEV4dGVuc2lvblJhbmdlT3B0aW9uc19WZXJpZmljYXRpb25TdGF0ZSkge1xuICAgIC8qKlxuICAgICAqIEFsbCB0aGUgZXh0ZW5zaW9ucyBvZiB0aGUgcmFuZ2UgbXVzdCBiZSBkZWNsYXJlZC5cbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBERUNMQVJBVElPTiA9IDA7XG4gICAgICovXG4gICAgRXh0ZW5zaW9uUmFuZ2VPcHRpb25zX1ZlcmlmaWNhdGlvblN0YXRlW0V4dGVuc2lvblJhbmdlT3B0aW9uc19WZXJpZmljYXRpb25TdGF0ZVtcIkRFQ0xBUkFUSU9OXCJdID0gMF0gPSBcIkRFQ0xBUkFUSU9OXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFVOVkVSSUZJRUQgPSAxO1xuICAgICAqL1xuICAgIEV4dGVuc2lvblJhbmdlT3B0aW9uc19WZXJpZmljYXRpb25TdGF0ZVtFeHRlbnNpb25SYW5nZU9wdGlvbnNfVmVyaWZpY2F0aW9uU3RhdGVbXCJVTlZFUklGSUVEXCJdID0gMV0gPSBcIlVOVkVSSUZJRURcIjtcbn0pKEV4dGVuc2lvblJhbmdlT3B0aW9uc19WZXJpZmljYXRpb25TdGF0ZSB8fCAoRXh0ZW5zaW9uUmFuZ2VPcHRpb25zX1ZlcmlmaWNhdGlvblN0YXRlID0ge30pKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5FeHRlbnNpb25SYW5nZU9wdGlvbnMuVmVyaWZpY2F0aW9uU3RhdGUuXG4gKi9cbmV4cG9ydCBjb25zdCBFeHRlbnNpb25SYW5nZU9wdGlvbnNfVmVyaWZpY2F0aW9uU3RhdGVTY2hlbWEgPSAvKkBfX1BVUkVfXyovIGVudW1EZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDMsIDApO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLkZpZWxkRGVzY3JpcHRvclByb3RvLlxuICogVXNlIGBjcmVhdGUoRmllbGREZXNjcmlwdG9yUHJvdG9TY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEZpZWxkRGVzY3JpcHRvclByb3RvU2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCA0KTtcbi8qKlxuICogQGdlbmVyYXRlZCBmcm9tIGVudW0gZ29vZ2xlLnByb3RvYnVmLkZpZWxkRGVzY3JpcHRvclByb3RvLlR5cGVcbiAqL1xuZXhwb3J0IHZhciBGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlO1xuKGZ1bmN0aW9uIChGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlKSB7XG4gICAgLyoqXG4gICAgICogMCBpcyByZXNlcnZlZCBmb3IgZXJyb3JzLlxuICAgICAqIE9yZGVyIGlzIHdlaXJkIGZvciBoaXN0b3JpY2FsIHJlYXNvbnMuXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVFlQRV9ET1VCTEUgPSAxO1xuICAgICAqL1xuICAgIEZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGVbRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtcIkRPVUJMRVwiXSA9IDFdID0gXCJET1VCTEVcIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVFlQRV9GTE9BVCA9IDI7XG4gICAgICovXG4gICAgRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW1wiRkxPQVRcIl0gPSAyXSA9IFwiRkxPQVRcIjtcbiAgICAvKipcbiAgICAgKiBOb3QgWmlnWmFnIGVuY29kZWQuICBOZWdhdGl2ZSBudW1iZXJzIHRha2UgMTAgYnl0ZXMuICBVc2UgVFlQRV9TSU5UNjQgaWZcbiAgICAgKiBuZWdhdGl2ZSB2YWx1ZXMgYXJlIGxpa2VseS5cbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBUWVBFX0lOVDY0ID0gMztcbiAgICAgKi9cbiAgICBGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW0ZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGVbXCJJTlQ2NFwiXSA9IDNdID0gXCJJTlQ2NFwiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBUWVBFX1VJTlQ2NCA9IDQ7XG4gICAgICovXG4gICAgRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW1wiVUlOVDY0XCJdID0gNF0gPSBcIlVJTlQ2NFwiO1xuICAgIC8qKlxuICAgICAqIE5vdCBaaWdaYWcgZW5jb2RlZC4gIE5lZ2F0aXZlIG51bWJlcnMgdGFrZSAxMCBieXRlcy4gIFVzZSBUWVBFX1NJTlQzMiBpZlxuICAgICAqIG5lZ2F0aXZlIHZhbHVlcyBhcmUgbGlrZWx5LlxuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFRZUEVfSU5UMzIgPSA1O1xuICAgICAqL1xuICAgIEZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGVbRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtcIklOVDMyXCJdID0gNV0gPSBcIklOVDMyXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFRZUEVfRklYRUQ2NCA9IDY7XG4gICAgICovXG4gICAgRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW1wiRklYRUQ2NFwiXSA9IDZdID0gXCJGSVhFRDY0XCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFRZUEVfRklYRUQzMiA9IDc7XG4gICAgICovXG4gICAgRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW1wiRklYRUQzMlwiXSA9IDddID0gXCJGSVhFRDMyXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFRZUEVfQk9PTCA9IDg7XG4gICAgICovXG4gICAgRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW1wiQk9PTFwiXSA9IDhdID0gXCJCT09MXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFRZUEVfU1RSSU5HID0gOTtcbiAgICAgKi9cbiAgICBGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW0ZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGVbXCJTVFJJTkdcIl0gPSA5XSA9IFwiU1RSSU5HXCI7XG4gICAgLyoqXG4gICAgICogVGFnLWRlbGltaXRlZCBhZ2dyZWdhdGUuXG4gICAgICogR3JvdXAgdHlwZSBpcyBkZXByZWNhdGVkIGFuZCBub3Qgc3VwcG9ydGVkIGFmdGVyIGdvb2dsZS5wcm90b2J1Zi4gSG93ZXZlciwgUHJvdG8zXG4gICAgICogaW1wbGVtZW50YXRpb25zIHNob3VsZCBzdGlsbCBiZSBhYmxlIHRvIHBhcnNlIHRoZSBncm91cCB3aXJlIGZvcm1hdCBhbmRcbiAgICAgKiB0cmVhdCBncm91cCBmaWVsZHMgYXMgdW5rbm93biBmaWVsZHMuICBJbiBFZGl0aW9ucywgdGhlIGdyb3VwIHdpcmUgZm9ybWF0XG4gICAgICogY2FuIGJlIGVuYWJsZWQgdmlhIHRoZSBgbWVzc2FnZV9lbmNvZGluZ2AgZmVhdHVyZS5cbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBUWVBFX0dST1VQID0gMTA7XG4gICAgICovXG4gICAgRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW1wiR1JPVVBcIl0gPSAxMF0gPSBcIkdST1VQXCI7XG4gICAgLyoqXG4gICAgICogTGVuZ3RoLWRlbGltaXRlZCBhZ2dyZWdhdGUuXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVFlQRV9NRVNTQUdFID0gMTE7XG4gICAgICovXG4gICAgRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW1wiTUVTU0FHRVwiXSA9IDExXSA9IFwiTUVTU0FHRVwiO1xuICAgIC8qKlxuICAgICAqIE5ldyBpbiB2ZXJzaW9uIDIuXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVFlQRV9CWVRFUyA9IDEyO1xuICAgICAqL1xuICAgIEZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGVbRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtcIkJZVEVTXCJdID0gMTJdID0gXCJCWVRFU1wiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBUWVBFX1VJTlQzMiA9IDEzO1xuICAgICAqL1xuICAgIEZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGVbRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtcIlVJTlQzMlwiXSA9IDEzXSA9IFwiVUlOVDMyXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFRZUEVfRU5VTSA9IDE0O1xuICAgICAqL1xuICAgIEZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGVbRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtcIkVOVU1cIl0gPSAxNF0gPSBcIkVOVU1cIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVFlQRV9TRklYRUQzMiA9IDE1O1xuICAgICAqL1xuICAgIEZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGVbRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtcIlNGSVhFRDMyXCJdID0gMTVdID0gXCJTRklYRUQzMlwiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBUWVBFX1NGSVhFRDY0ID0gMTY7XG4gICAgICovXG4gICAgRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW1wiU0ZJWEVENjRcIl0gPSAxNl0gPSBcIlNGSVhFRDY0XCI7XG4gICAgLyoqXG4gICAgICogVXNlcyBaaWdaYWcgZW5jb2RpbmcuXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVFlQRV9TSU5UMzIgPSAxNztcbiAgICAgKi9cbiAgICBGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW0ZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGVbXCJTSU5UMzJcIl0gPSAxN10gPSBcIlNJTlQzMlwiO1xuICAgIC8qKlxuICAgICAqIFVzZXMgWmlnWmFnIGVuY29kaW5nLlxuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFRZUEVfU0lOVDY0ID0gMTg7XG4gICAgICovXG4gICAgRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZVtGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlW1wiU0lOVDY0XCJdID0gMThdID0gXCJTSU5UNjRcIjtcbn0pKEZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGUgfHwgKEZpZWxkRGVzY3JpcHRvclByb3RvX1R5cGUgPSB7fSkpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIGVudW0gZ29vZ2xlLnByb3RvYnVmLkZpZWxkRGVzY3JpcHRvclByb3RvLlR5cGUuXG4gKi9cbmV4cG9ydCBjb25zdCBGaWVsZERlc2NyaXB0b3JQcm90b19UeXBlU2NoZW1hID0gLypAX19QVVJFX18qLyBlbnVtRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCA0LCAwKTtcbi8qKlxuICogQGdlbmVyYXRlZCBmcm9tIGVudW0gZ29vZ2xlLnByb3RvYnVmLkZpZWxkRGVzY3JpcHRvclByb3RvLkxhYmVsXG4gKi9cbmV4cG9ydCB2YXIgRmllbGREZXNjcmlwdG9yUHJvdG9fTGFiZWw7XG4oZnVuY3Rpb24gKEZpZWxkRGVzY3JpcHRvclByb3RvX0xhYmVsKSB7XG4gICAgLyoqXG4gICAgICogMCBpcyByZXNlcnZlZCBmb3IgZXJyb3JzXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogTEFCRUxfT1BUSU9OQUwgPSAxO1xuICAgICAqL1xuICAgIEZpZWxkRGVzY3JpcHRvclByb3RvX0xhYmVsW0ZpZWxkRGVzY3JpcHRvclByb3RvX0xhYmVsW1wiT1BUSU9OQUxcIl0gPSAxXSA9IFwiT1BUSU9OQUxcIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogTEFCRUxfUkVQRUFURUQgPSAzO1xuICAgICAqL1xuICAgIEZpZWxkRGVzY3JpcHRvclByb3RvX0xhYmVsW0ZpZWxkRGVzY3JpcHRvclByb3RvX0xhYmVsW1wiUkVQRUFURURcIl0gPSAzXSA9IFwiUkVQRUFURURcIjtcbiAgICAvKipcbiAgICAgKiBUaGUgcmVxdWlyZWQgbGFiZWwgaXMgb25seSBhbGxvd2VkIGluIGdvb2dsZS5wcm90b2J1Zi4gIEluIHByb3RvMyBhbmQgRWRpdGlvbnNcbiAgICAgKiBpdCdzIGV4cGxpY2l0bHkgcHJvaGliaXRlZC4gIEluIEVkaXRpb25zLCB0aGUgYGZpZWxkX3ByZXNlbmNlYCBmZWF0dXJlXG4gICAgICogY2FuIGJlIHVzZWQgdG8gZ2V0IHRoaXMgYmVoYXZpb3IuXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogTEFCRUxfUkVRVUlSRUQgPSAyO1xuICAgICAqL1xuICAgIEZpZWxkRGVzY3JpcHRvclByb3RvX0xhYmVsW0ZpZWxkRGVzY3JpcHRvclByb3RvX0xhYmVsW1wiUkVRVUlSRURcIl0gPSAyXSA9IFwiUkVRVUlSRURcIjtcbn0pKEZpZWxkRGVzY3JpcHRvclByb3RvX0xhYmVsIHx8IChGaWVsZERlc2NyaXB0b3JQcm90b19MYWJlbCA9IHt9KSk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgZW51bSBnb29nbGUucHJvdG9idWYuRmllbGREZXNjcmlwdG9yUHJvdG8uTGFiZWwuXG4gKi9cbmV4cG9ydCBjb25zdCBGaWVsZERlc2NyaXB0b3JQcm90b19MYWJlbFNjaGVtYSA9IC8qQF9fUFVSRV9fKi8gZW51bURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgNCwgMSk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBnb29nbGUucHJvdG9idWYuT25lb2ZEZXNjcmlwdG9yUHJvdG8uXG4gKiBVc2UgYGNyZWF0ZShPbmVvZkRlc2NyaXB0b3JQcm90b1NjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgT25lb2ZEZXNjcmlwdG9yUHJvdG9TY2hlbWEgPSAvKkBfX1BVUkVfXyovIG1lc3NhZ2VEZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDUpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLkVudW1EZXNjcmlwdG9yUHJvdG8uXG4gKiBVc2UgYGNyZWF0ZShFbnVtRGVzY3JpcHRvclByb3RvU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBFbnVtRGVzY3JpcHRvclByb3RvU2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCA2KTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5FbnVtRGVzY3JpcHRvclByb3RvLkVudW1SZXNlcnZlZFJhbmdlLlxuICogVXNlIGBjcmVhdGUoRW51bURlc2NyaXB0b3JQcm90b19FbnVtUmVzZXJ2ZWRSYW5nZVNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgRW51bURlc2NyaXB0b3JQcm90b19FbnVtUmVzZXJ2ZWRSYW5nZVNjaGVtYSA9IC8qQF9fUFVSRV9fKi8gbWVzc2FnZURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgNiwgMCk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBnb29nbGUucHJvdG9idWYuRW51bVZhbHVlRGVzY3JpcHRvclByb3RvLlxuICogVXNlIGBjcmVhdGUoRW51bVZhbHVlRGVzY3JpcHRvclByb3RvU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBFbnVtVmFsdWVEZXNjcmlwdG9yUHJvdG9TY2hlbWEgPSAvKkBfX1BVUkVfXyovIG1lc3NhZ2VEZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDcpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLlNlcnZpY2VEZXNjcmlwdG9yUHJvdG8uXG4gKiBVc2UgYGNyZWF0ZShTZXJ2aWNlRGVzY3JpcHRvclByb3RvU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBTZXJ2aWNlRGVzY3JpcHRvclByb3RvU2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCA4KTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5NZXRob2REZXNjcmlwdG9yUHJvdG8uXG4gKiBVc2UgYGNyZWF0ZShNZXRob2REZXNjcmlwdG9yUHJvdG9TY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IE1ldGhvZERlc2NyaXB0b3JQcm90b1NjaGVtYSA9IC8qQF9fUFVSRV9fKi8gbWVzc2FnZURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgOSk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBnb29nbGUucHJvdG9idWYuRmlsZU9wdGlvbnMuXG4gKiBVc2UgYGNyZWF0ZShGaWxlT3B0aW9uc1NjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgRmlsZU9wdGlvbnNTY2hlbWEgPSAvKkBfX1BVUkVfXyovIG1lc3NhZ2VEZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDEwKTtcbi8qKlxuICogR2VuZXJhdGVkIGNsYXNzZXMgY2FuIGJlIG9wdGltaXplZCBmb3Igc3BlZWQgb3IgY29kZSBzaXplLlxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5GaWxlT3B0aW9ucy5PcHRpbWl6ZU1vZGVcbiAqL1xuZXhwb3J0IHZhciBGaWxlT3B0aW9uc19PcHRpbWl6ZU1vZGU7XG4oZnVuY3Rpb24gKEZpbGVPcHRpb25zX09wdGltaXplTW9kZSkge1xuICAgIC8qKlxuICAgICAqIEdlbmVyYXRlIGNvbXBsZXRlIGNvZGUgZm9yIHBhcnNpbmcsIHNlcmlhbGl6YXRpb24sXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogU1BFRUQgPSAxO1xuICAgICAqL1xuICAgIEZpbGVPcHRpb25zX09wdGltaXplTW9kZVtGaWxlT3B0aW9uc19PcHRpbWl6ZU1vZGVbXCJTUEVFRFwiXSA9IDFdID0gXCJTUEVFRFwiO1xuICAgIC8qKlxuICAgICAqIGV0Yy5cbiAgICAgKlxuICAgICAqIFVzZSBSZWZsZWN0aW9uT3BzIHRvIGltcGxlbWVudCB0aGVzZSBtZXRob2RzLlxuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IENPREVfU0laRSA9IDI7XG4gICAgICovXG4gICAgRmlsZU9wdGlvbnNfT3B0aW1pemVNb2RlW0ZpbGVPcHRpb25zX09wdGltaXplTW9kZVtcIkNPREVfU0laRVwiXSA9IDJdID0gXCJDT0RFX1NJWkVcIjtcbiAgICAvKipcbiAgICAgKiBHZW5lcmF0ZSBjb2RlIHVzaW5nIE1lc3NhZ2VMaXRlIGFuZCB0aGUgbGl0ZSBydW50aW1lLlxuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IExJVEVfUlVOVElNRSA9IDM7XG4gICAgICovXG4gICAgRmlsZU9wdGlvbnNfT3B0aW1pemVNb2RlW0ZpbGVPcHRpb25zX09wdGltaXplTW9kZVtcIkxJVEVfUlVOVElNRVwiXSA9IDNdID0gXCJMSVRFX1JVTlRJTUVcIjtcbn0pKEZpbGVPcHRpb25zX09wdGltaXplTW9kZSB8fCAoRmlsZU9wdGlvbnNfT3B0aW1pemVNb2RlID0ge30pKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5GaWxlT3B0aW9ucy5PcHRpbWl6ZU1vZGUuXG4gKi9cbmV4cG9ydCBjb25zdCBGaWxlT3B0aW9uc19PcHRpbWl6ZU1vZGVTY2hlbWEgPSAvKkBfX1BVUkVfXyovIGVudW1EZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDEwLCAwKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5NZXNzYWdlT3B0aW9ucy5cbiAqIFVzZSBgY3JlYXRlKE1lc3NhZ2VPcHRpb25zU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBNZXNzYWdlT3B0aW9uc1NjaGVtYSA9IC8qQF9fUFVSRV9fKi8gbWVzc2FnZURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMTEpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLkZpZWxkT3B0aW9ucy5cbiAqIFVzZSBgY3JlYXRlKEZpZWxkT3B0aW9uc1NjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgRmllbGRPcHRpb25zU2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAxMik7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBnb29nbGUucHJvdG9idWYuRmllbGRPcHRpb25zLkVkaXRpb25EZWZhdWx0LlxuICogVXNlIGBjcmVhdGUoRmllbGRPcHRpb25zX0VkaXRpb25EZWZhdWx0U2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBGaWVsZE9wdGlvbnNfRWRpdGlvbkRlZmF1bHRTY2hlbWEgPSAvKkBfX1BVUkVfXyovIG1lc3NhZ2VEZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDEyLCAwKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5GaWVsZE9wdGlvbnMuRmVhdHVyZVN1cHBvcnQuXG4gKiBVc2UgYGNyZWF0ZShGaWVsZE9wdGlvbnNfRmVhdHVyZVN1cHBvcnRTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEZpZWxkT3B0aW9uc19GZWF0dXJlU3VwcG9ydFNjaGVtYSA9IC8qQF9fUFVSRV9fKi8gbWVzc2FnZURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMTIsIDEpO1xuLyoqXG4gKiBAZ2VuZXJhdGVkIGZyb20gZW51bSBnb29nbGUucHJvdG9idWYuRmllbGRPcHRpb25zLkNUeXBlXG4gKi9cbmV4cG9ydCB2YXIgRmllbGRPcHRpb25zX0NUeXBlO1xuKGZ1bmN0aW9uIChGaWVsZE9wdGlvbnNfQ1R5cGUpIHtcbiAgICAvKipcbiAgICAgKiBEZWZhdWx0IG1vZGUuXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogU1RSSU5HID0gMDtcbiAgICAgKi9cbiAgICBGaWVsZE9wdGlvbnNfQ1R5cGVbRmllbGRPcHRpb25zX0NUeXBlW1wiU1RSSU5HXCJdID0gMF0gPSBcIlNUUklOR1wiO1xuICAgIC8qKlxuICAgICAqIFRoZSBvcHRpb24gW2N0eXBlPUNPUkRdIG1heSBiZSBhcHBsaWVkIHRvIGEgbm9uLXJlcGVhdGVkIGZpZWxkIG9mIHR5cGVcbiAgICAgKiBcImJ5dGVzXCIuIEl0IGluZGljYXRlcyB0aGF0IGluIEMrKywgdGhlIGRhdGEgc2hvdWxkIGJlIHN0b3JlZCBpbiBhIENvcmRcbiAgICAgKiBpbnN0ZWFkIG9mIGEgc3RyaW5nLiAgRm9yIHZlcnkgbGFyZ2Ugc3RyaW5ncywgdGhpcyBtYXkgcmVkdWNlIG1lbW9yeVxuICAgICAqIGZyYWdtZW50YXRpb24uIEl0IG1heSBhbHNvIGFsbG93IGJldHRlciBwZXJmb3JtYW5jZSB3aGVuIHBhcnNpbmcgZnJvbSBhXG4gICAgICogQ29yZCwgb3Igd2hlbiBwYXJzaW5nIHdpdGggYWxpYXNpbmcgZW5hYmxlZCwgYXMgdGhlIHBhcnNlZCBDb3JkIG1heSB0aGVuXG4gICAgICogYWxpYXMgdGhlIG9yaWdpbmFsIGJ1ZmZlci5cbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBDT1JEID0gMTtcbiAgICAgKi9cbiAgICBGaWVsZE9wdGlvbnNfQ1R5cGVbRmllbGRPcHRpb25zX0NUeXBlW1wiQ09SRFwiXSA9IDFdID0gXCJDT1JEXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFNUUklOR19QSUVDRSA9IDI7XG4gICAgICovXG4gICAgRmllbGRPcHRpb25zX0NUeXBlW0ZpZWxkT3B0aW9uc19DVHlwZVtcIlNUUklOR19QSUVDRVwiXSA9IDJdID0gXCJTVFJJTkdfUElFQ0VcIjtcbn0pKEZpZWxkT3B0aW9uc19DVHlwZSB8fCAoRmllbGRPcHRpb25zX0NUeXBlID0ge30pKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5GaWVsZE9wdGlvbnMuQ1R5cGUuXG4gKi9cbmV4cG9ydCBjb25zdCBGaWVsZE9wdGlvbnNfQ1R5cGVTY2hlbWEgPSAvKkBfX1BVUkVfXyovIGVudW1EZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDEyLCAwKTtcbi8qKlxuICogQGdlbmVyYXRlZCBmcm9tIGVudW0gZ29vZ2xlLnByb3RvYnVmLkZpZWxkT3B0aW9ucy5KU1R5cGVcbiAqL1xuZXhwb3J0IHZhciBGaWVsZE9wdGlvbnNfSlNUeXBlO1xuKGZ1bmN0aW9uIChGaWVsZE9wdGlvbnNfSlNUeXBlKSB7XG4gICAgLyoqXG4gICAgICogVXNlIHRoZSBkZWZhdWx0IHR5cGUuXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogSlNfTk9STUFMID0gMDtcbiAgICAgKi9cbiAgICBGaWVsZE9wdGlvbnNfSlNUeXBlW0ZpZWxkT3B0aW9uc19KU1R5cGVbXCJKU19OT1JNQUxcIl0gPSAwXSA9IFwiSlNfTk9STUFMXCI7XG4gICAgLyoqXG4gICAgICogVXNlIEphdmFTY3JpcHQgc3RyaW5ncy5cbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBKU19TVFJJTkcgPSAxO1xuICAgICAqL1xuICAgIEZpZWxkT3B0aW9uc19KU1R5cGVbRmllbGRPcHRpb25zX0pTVHlwZVtcIkpTX1NUUklOR1wiXSA9IDFdID0gXCJKU19TVFJJTkdcIjtcbiAgICAvKipcbiAgICAgKiBVc2UgSmF2YVNjcmlwdCBudW1iZXJzLlxuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IEpTX05VTUJFUiA9IDI7XG4gICAgICovXG4gICAgRmllbGRPcHRpb25zX0pTVHlwZVtGaWVsZE9wdGlvbnNfSlNUeXBlW1wiSlNfTlVNQkVSXCJdID0gMl0gPSBcIkpTX05VTUJFUlwiO1xufSkoRmllbGRPcHRpb25zX0pTVHlwZSB8fCAoRmllbGRPcHRpb25zX0pTVHlwZSA9IHt9KSk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgZW51bSBnb29nbGUucHJvdG9idWYuRmllbGRPcHRpb25zLkpTVHlwZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEZpZWxkT3B0aW9uc19KU1R5cGVTY2hlbWEgPSAvKkBfX1BVUkVfXyovIGVudW1EZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDEyLCAxKTtcbi8qKlxuICogSWYgc2V0IHRvIFJFVEVOVElPTl9TT1VSQ0UsIHRoZSBvcHRpb24gd2lsbCBiZSBvbWl0dGVkIGZyb20gdGhlIGJpbmFyeS5cbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gZW51bSBnb29nbGUucHJvdG9idWYuRmllbGRPcHRpb25zLk9wdGlvblJldGVudGlvblxuICovXG5leHBvcnQgdmFyIEZpZWxkT3B0aW9uc19PcHRpb25SZXRlbnRpb247XG4oZnVuY3Rpb24gKEZpZWxkT3B0aW9uc19PcHRpb25SZXRlbnRpb24pIHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogUkVURU5USU9OX1VOS05PV04gPSAwO1xuICAgICAqL1xuICAgIEZpZWxkT3B0aW9uc19PcHRpb25SZXRlbnRpb25bRmllbGRPcHRpb25zX09wdGlvblJldGVudGlvbltcIlJFVEVOVElPTl9VTktOT1dOXCJdID0gMF0gPSBcIlJFVEVOVElPTl9VTktOT1dOXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFJFVEVOVElPTl9SVU5USU1FID0gMTtcbiAgICAgKi9cbiAgICBGaWVsZE9wdGlvbnNfT3B0aW9uUmV0ZW50aW9uW0ZpZWxkT3B0aW9uc19PcHRpb25SZXRlbnRpb25bXCJSRVRFTlRJT05fUlVOVElNRVwiXSA9IDFdID0gXCJSRVRFTlRJT05fUlVOVElNRVwiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBSRVRFTlRJT05fU09VUkNFID0gMjtcbiAgICAgKi9cbiAgICBGaWVsZE9wdGlvbnNfT3B0aW9uUmV0ZW50aW9uW0ZpZWxkT3B0aW9uc19PcHRpb25SZXRlbnRpb25bXCJSRVRFTlRJT05fU09VUkNFXCJdID0gMl0gPSBcIlJFVEVOVElPTl9TT1VSQ0VcIjtcbn0pKEZpZWxkT3B0aW9uc19PcHRpb25SZXRlbnRpb24gfHwgKEZpZWxkT3B0aW9uc19PcHRpb25SZXRlbnRpb24gPSB7fSkpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIGVudW0gZ29vZ2xlLnByb3RvYnVmLkZpZWxkT3B0aW9ucy5PcHRpb25SZXRlbnRpb24uXG4gKi9cbmV4cG9ydCBjb25zdCBGaWVsZE9wdGlvbnNfT3B0aW9uUmV0ZW50aW9uU2NoZW1hID0gLypAX19QVVJFX18qLyBlbnVtRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAxMiwgMik7XG4vKipcbiAqIFRoaXMgaW5kaWNhdGVzIHRoZSB0eXBlcyBvZiBlbnRpdGllcyB0aGF0IHRoZSBmaWVsZCBtYXkgYXBwbHkgdG8gd2hlbiB1c2VkXG4gKiBhcyBhbiBvcHRpb24uIElmIGl0IGlzIHVuc2V0LCB0aGVuIHRoZSBmaWVsZCBtYXkgYmUgZnJlZWx5IHVzZWQgYXMgYW5cbiAqIG9wdGlvbiBvbiBhbnkga2luZCBvZiBlbnRpdHkuXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIGVudW0gZ29vZ2xlLnByb3RvYnVmLkZpZWxkT3B0aW9ucy5PcHRpb25UYXJnZXRUeXBlXG4gKi9cbmV4cG9ydCB2YXIgRmllbGRPcHRpb25zX09wdGlvblRhcmdldFR5cGU7XG4oZnVuY3Rpb24gKEZpZWxkT3B0aW9uc19PcHRpb25UYXJnZXRUeXBlKSB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFRBUkdFVF9UWVBFX1VOS05PV04gPSAwO1xuICAgICAqL1xuICAgIEZpZWxkT3B0aW9uc19PcHRpb25UYXJnZXRUeXBlW0ZpZWxkT3B0aW9uc19PcHRpb25UYXJnZXRUeXBlW1wiVEFSR0VUX1RZUEVfVU5LTk9XTlwiXSA9IDBdID0gXCJUQVJHRVRfVFlQRV9VTktOT1dOXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFRBUkdFVF9UWVBFX0ZJTEUgPSAxO1xuICAgICAqL1xuICAgIEZpZWxkT3B0aW9uc19PcHRpb25UYXJnZXRUeXBlW0ZpZWxkT3B0aW9uc19PcHRpb25UYXJnZXRUeXBlW1wiVEFSR0VUX1RZUEVfRklMRVwiXSA9IDFdID0gXCJUQVJHRVRfVFlQRV9GSUxFXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFRBUkdFVF9UWVBFX0VYVEVOU0lPTl9SQU5HRSA9IDI7XG4gICAgICovXG4gICAgRmllbGRPcHRpb25zX09wdGlvblRhcmdldFR5cGVbRmllbGRPcHRpb25zX09wdGlvblRhcmdldFR5cGVbXCJUQVJHRVRfVFlQRV9FWFRFTlNJT05fUkFOR0VcIl0gPSAyXSA9IFwiVEFSR0VUX1RZUEVfRVhURU5TSU9OX1JBTkdFXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFRBUkdFVF9UWVBFX01FU1NBR0UgPSAzO1xuICAgICAqL1xuICAgIEZpZWxkT3B0aW9uc19PcHRpb25UYXJnZXRUeXBlW0ZpZWxkT3B0aW9uc19PcHRpb25UYXJnZXRUeXBlW1wiVEFSR0VUX1RZUEVfTUVTU0FHRVwiXSA9IDNdID0gXCJUQVJHRVRfVFlQRV9NRVNTQUdFXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFRBUkdFVF9UWVBFX0ZJRUxEID0gNDtcbiAgICAgKi9cbiAgICBGaWVsZE9wdGlvbnNfT3B0aW9uVGFyZ2V0VHlwZVtGaWVsZE9wdGlvbnNfT3B0aW9uVGFyZ2V0VHlwZVtcIlRBUkdFVF9UWVBFX0ZJRUxEXCJdID0gNF0gPSBcIlRBUkdFVF9UWVBFX0ZJRUxEXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFRBUkdFVF9UWVBFX09ORU9GID0gNTtcbiAgICAgKi9cbiAgICBGaWVsZE9wdGlvbnNfT3B0aW9uVGFyZ2V0VHlwZVtGaWVsZE9wdGlvbnNfT3B0aW9uVGFyZ2V0VHlwZVtcIlRBUkdFVF9UWVBFX09ORU9GXCJdID0gNV0gPSBcIlRBUkdFVF9UWVBFX09ORU9GXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFRBUkdFVF9UWVBFX0VOVU0gPSA2O1xuICAgICAqL1xuICAgIEZpZWxkT3B0aW9uc19PcHRpb25UYXJnZXRUeXBlW0ZpZWxkT3B0aW9uc19PcHRpb25UYXJnZXRUeXBlW1wiVEFSR0VUX1RZUEVfRU5VTVwiXSA9IDZdID0gXCJUQVJHRVRfVFlQRV9FTlVNXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFRBUkdFVF9UWVBFX0VOVU1fRU5UUlkgPSA3O1xuICAgICAqL1xuICAgIEZpZWxkT3B0aW9uc19PcHRpb25UYXJnZXRUeXBlW0ZpZWxkT3B0aW9uc19PcHRpb25UYXJnZXRUeXBlW1wiVEFSR0VUX1RZUEVfRU5VTV9FTlRSWVwiXSA9IDddID0gXCJUQVJHRVRfVFlQRV9FTlVNX0VOVFJZXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFRBUkdFVF9UWVBFX1NFUlZJQ0UgPSA4O1xuICAgICAqL1xuICAgIEZpZWxkT3B0aW9uc19PcHRpb25UYXJnZXRUeXBlW0ZpZWxkT3B0aW9uc19PcHRpb25UYXJnZXRUeXBlW1wiVEFSR0VUX1RZUEVfU0VSVklDRVwiXSA9IDhdID0gXCJUQVJHRVRfVFlQRV9TRVJWSUNFXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFRBUkdFVF9UWVBFX01FVEhPRCA9IDk7XG4gICAgICovXG4gICAgRmllbGRPcHRpb25zX09wdGlvblRhcmdldFR5cGVbRmllbGRPcHRpb25zX09wdGlvblRhcmdldFR5cGVbXCJUQVJHRVRfVFlQRV9NRVRIT0RcIl0gPSA5XSA9IFwiVEFSR0VUX1RZUEVfTUVUSE9EXCI7XG59KShGaWVsZE9wdGlvbnNfT3B0aW9uVGFyZ2V0VHlwZSB8fCAoRmllbGRPcHRpb25zX09wdGlvblRhcmdldFR5cGUgPSB7fSkpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIGVudW0gZ29vZ2xlLnByb3RvYnVmLkZpZWxkT3B0aW9ucy5PcHRpb25UYXJnZXRUeXBlLlxuICovXG5leHBvcnQgY29uc3QgRmllbGRPcHRpb25zX09wdGlvblRhcmdldFR5cGVTY2hlbWEgPSAvKkBfX1BVUkVfXyovIGVudW1EZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDEyLCAzKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5PbmVvZk9wdGlvbnMuXG4gKiBVc2UgYGNyZWF0ZShPbmVvZk9wdGlvbnNTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IE9uZW9mT3B0aW9uc1NjaGVtYSA9IC8qQF9fUFVSRV9fKi8gbWVzc2FnZURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMTMpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLkVudW1PcHRpb25zLlxuICogVXNlIGBjcmVhdGUoRW51bU9wdGlvbnNTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEVudW1PcHRpb25zU2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAxNCk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBnb29nbGUucHJvdG9idWYuRW51bVZhbHVlT3B0aW9ucy5cbiAqIFVzZSBgY3JlYXRlKEVudW1WYWx1ZU9wdGlvbnNTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEVudW1WYWx1ZU9wdGlvbnNTY2hlbWEgPSAvKkBfX1BVUkVfXyovIG1lc3NhZ2VEZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDE1KTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5TZXJ2aWNlT3B0aW9ucy5cbiAqIFVzZSBgY3JlYXRlKFNlcnZpY2VPcHRpb25zU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBTZXJ2aWNlT3B0aW9uc1NjaGVtYSA9IC8qQF9fUFVSRV9fKi8gbWVzc2FnZURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMTYpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLk1ldGhvZE9wdGlvbnMuXG4gKiBVc2UgYGNyZWF0ZShNZXRob2RPcHRpb25zU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBNZXRob2RPcHRpb25zU2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAxNyk7XG4vKipcbiAqIElzIHRoaXMgbWV0aG9kIHNpZGUtZWZmZWN0LWZyZWUgKG9yIHNhZmUgaW4gSFRUUCBwYXJsYW5jZSksIG9yIGlkZW1wb3RlbnQsXG4gKiBvciBuZWl0aGVyPyBIVFRQIGJhc2VkIFJQQyBpbXBsZW1lbnRhdGlvbiBtYXkgY2hvb3NlIEdFVCB2ZXJiIGZvciBzYWZlXG4gKiBtZXRob2RzLCBhbmQgUFVUIHZlcmIgZm9yIGlkZW1wb3RlbnQgbWV0aG9kcyBpbnN0ZWFkIG9mIHRoZSBkZWZhdWx0IFBPU1QuXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIGVudW0gZ29vZ2xlLnByb3RvYnVmLk1ldGhvZE9wdGlvbnMuSWRlbXBvdGVuY3lMZXZlbFxuICovXG5leHBvcnQgdmFyIE1ldGhvZE9wdGlvbnNfSWRlbXBvdGVuY3lMZXZlbDtcbihmdW5jdGlvbiAoTWV0aG9kT3B0aW9uc19JZGVtcG90ZW5jeUxldmVsKSB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IElERU1QT1RFTkNZX1VOS05PV04gPSAwO1xuICAgICAqL1xuICAgIE1ldGhvZE9wdGlvbnNfSWRlbXBvdGVuY3lMZXZlbFtNZXRob2RPcHRpb25zX0lkZW1wb3RlbmN5TGV2ZWxbXCJJREVNUE9URU5DWV9VTktOT1dOXCJdID0gMF0gPSBcIklERU1QT1RFTkNZX1VOS05PV05cIjtcbiAgICAvKipcbiAgICAgKiBpbXBsaWVzIGlkZW1wb3RlbnRcbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBOT19TSURFX0VGRkVDVFMgPSAxO1xuICAgICAqL1xuICAgIE1ldGhvZE9wdGlvbnNfSWRlbXBvdGVuY3lMZXZlbFtNZXRob2RPcHRpb25zX0lkZW1wb3RlbmN5TGV2ZWxbXCJOT19TSURFX0VGRkVDVFNcIl0gPSAxXSA9IFwiTk9fU0lERV9FRkZFQ1RTXCI7XG4gICAgLyoqXG4gICAgICogaWRlbXBvdGVudCwgYnV0IG1heSBoYXZlIHNpZGUgZWZmZWN0c1xuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IElERU1QT1RFTlQgPSAyO1xuICAgICAqL1xuICAgIE1ldGhvZE9wdGlvbnNfSWRlbXBvdGVuY3lMZXZlbFtNZXRob2RPcHRpb25zX0lkZW1wb3RlbmN5TGV2ZWxbXCJJREVNUE9URU5UXCJdID0gMl0gPSBcIklERU1QT1RFTlRcIjtcbn0pKE1ldGhvZE9wdGlvbnNfSWRlbXBvdGVuY3lMZXZlbCB8fCAoTWV0aG9kT3B0aW9uc19JZGVtcG90ZW5jeUxldmVsID0ge30pKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5NZXRob2RPcHRpb25zLklkZW1wb3RlbmN5TGV2ZWwuXG4gKi9cbmV4cG9ydCBjb25zdCBNZXRob2RPcHRpb25zX0lkZW1wb3RlbmN5TGV2ZWxTY2hlbWEgPSAvKkBfX1BVUkVfXyovIGVudW1EZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDE3LCAwKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5VbmludGVycHJldGVkT3B0aW9uLlxuICogVXNlIGBjcmVhdGUoVW5pbnRlcnByZXRlZE9wdGlvblNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgVW5pbnRlcnByZXRlZE9wdGlvblNjaGVtYSA9IC8qQF9fUFVSRV9fKi8gbWVzc2FnZURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMTgpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLlVuaW50ZXJwcmV0ZWRPcHRpb24uTmFtZVBhcnQuXG4gKiBVc2UgYGNyZWF0ZShVbmludGVycHJldGVkT3B0aW9uX05hbWVQYXJ0U2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBVbmludGVycHJldGVkT3B0aW9uX05hbWVQYXJ0U2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAxOCwgMCk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBnb29nbGUucHJvdG9idWYuRmVhdHVyZVNldC5cbiAqIFVzZSBgY3JlYXRlKEZlYXR1cmVTZXRTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEZlYXR1cmVTZXRTY2hlbWEgPSAvKkBfX1BVUkVfXyovIG1lc3NhZ2VEZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDE5KTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LlZpc2liaWxpdHlGZWF0dXJlLlxuICogVXNlIGBjcmVhdGUoRmVhdHVyZVNldF9WaXNpYmlsaXR5RmVhdHVyZVNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgRmVhdHVyZVNldF9WaXNpYmlsaXR5RmVhdHVyZVNjaGVtYSA9IC8qQF9fUFVSRV9fKi8gbWVzc2FnZURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMTksIDApO1xuLyoqXG4gKiBAZ2VuZXJhdGVkIGZyb20gZW51bSBnb29nbGUucHJvdG9idWYuRmVhdHVyZVNldC5WaXNpYmlsaXR5RmVhdHVyZS5EZWZhdWx0U3ltYm9sVmlzaWJpbGl0eVxuICovXG5leHBvcnQgdmFyIEZlYXR1cmVTZXRfVmlzaWJpbGl0eUZlYXR1cmVfRGVmYXVsdFN5bWJvbFZpc2liaWxpdHk7XG4oZnVuY3Rpb24gKEZlYXR1cmVTZXRfVmlzaWJpbGl0eUZlYXR1cmVfRGVmYXVsdFN5bWJvbFZpc2liaWxpdHkpIHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogREVGQVVMVF9TWU1CT0xfVklTSUJJTElUWV9VTktOT1dOID0gMDtcbiAgICAgKi9cbiAgICBGZWF0dXJlU2V0X1Zpc2liaWxpdHlGZWF0dXJlX0RlZmF1bHRTeW1ib2xWaXNpYmlsaXR5W0ZlYXR1cmVTZXRfVmlzaWJpbGl0eUZlYXR1cmVfRGVmYXVsdFN5bWJvbFZpc2liaWxpdHlbXCJERUZBVUxUX1NZTUJPTF9WSVNJQklMSVRZX1VOS05PV05cIl0gPSAwXSA9IFwiREVGQVVMVF9TWU1CT0xfVklTSUJJTElUWV9VTktOT1dOXCI7XG4gICAgLyoqXG4gICAgICogRGVmYXVsdCBwcmUtRURJVElPTl8yMDI0LCBhbGwgVU5TRVQgdmlzaWJpbGl0eSBhcmUgZXhwb3J0LlxuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IEVYUE9SVF9BTEwgPSAxO1xuICAgICAqL1xuICAgIEZlYXR1cmVTZXRfVmlzaWJpbGl0eUZlYXR1cmVfRGVmYXVsdFN5bWJvbFZpc2liaWxpdHlbRmVhdHVyZVNldF9WaXNpYmlsaXR5RmVhdHVyZV9EZWZhdWx0U3ltYm9sVmlzaWJpbGl0eVtcIkVYUE9SVF9BTExcIl0gPSAxXSA9IFwiRVhQT1JUX0FMTFwiO1xuICAgIC8qKlxuICAgICAqIEFsbCB0b3AtbGV2ZWwgc3ltYm9scyBkZWZhdWx0IHRvIGV4cG9ydCwgbmVzdGVkIGRlZmF1bHQgdG8gbG9jYWwuXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogRVhQT1JUX1RPUF9MRVZFTCA9IDI7XG4gICAgICovXG4gICAgRmVhdHVyZVNldF9WaXNpYmlsaXR5RmVhdHVyZV9EZWZhdWx0U3ltYm9sVmlzaWJpbGl0eVtGZWF0dXJlU2V0X1Zpc2liaWxpdHlGZWF0dXJlX0RlZmF1bHRTeW1ib2xWaXNpYmlsaXR5W1wiRVhQT1JUX1RPUF9MRVZFTFwiXSA9IDJdID0gXCJFWFBPUlRfVE9QX0xFVkVMXCI7XG4gICAgLyoqXG4gICAgICogQWxsIHN5bWJvbHMgZGVmYXVsdCB0byBsb2NhbC5cbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBMT0NBTF9BTEwgPSAzO1xuICAgICAqL1xuICAgIEZlYXR1cmVTZXRfVmlzaWJpbGl0eUZlYXR1cmVfRGVmYXVsdFN5bWJvbFZpc2liaWxpdHlbRmVhdHVyZVNldF9WaXNpYmlsaXR5RmVhdHVyZV9EZWZhdWx0U3ltYm9sVmlzaWJpbGl0eVtcIkxPQ0FMX0FMTFwiXSA9IDNdID0gXCJMT0NBTF9BTExcIjtcbiAgICAvKipcbiAgICAgKiBBbGwgc3ltYm9scyBsb2NhbCBieSBkZWZhdWx0LiBOZXN0ZWQgdHlwZXMgY2Fubm90IGJlIGV4cG9ydGVkLlxuICAgICAqIFdpdGggc3BlY2lhbCBjYXNlIGNhdmVhdCBmb3IgbWVzc2FnZSB7IGVudW0ge30gcmVzZXJ2ZWQgMSB0byBtYXg7IH1cbiAgICAgKiBUaGlzIGlzIHRoZSByZWNvbW1lbmRlZCBzZXR0aW5nIGZvciBuZXcgcHJvdG9zLlxuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFNUUklDVCA9IDQ7XG4gICAgICovXG4gICAgRmVhdHVyZVNldF9WaXNpYmlsaXR5RmVhdHVyZV9EZWZhdWx0U3ltYm9sVmlzaWJpbGl0eVtGZWF0dXJlU2V0X1Zpc2liaWxpdHlGZWF0dXJlX0RlZmF1bHRTeW1ib2xWaXNpYmlsaXR5W1wiU1RSSUNUXCJdID0gNF0gPSBcIlNUUklDVFwiO1xufSkoRmVhdHVyZVNldF9WaXNpYmlsaXR5RmVhdHVyZV9EZWZhdWx0U3ltYm9sVmlzaWJpbGl0eSB8fCAoRmVhdHVyZVNldF9WaXNpYmlsaXR5RmVhdHVyZV9EZWZhdWx0U3ltYm9sVmlzaWJpbGl0eSA9IHt9KSk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgZW51bSBnb29nbGUucHJvdG9idWYuRmVhdHVyZVNldC5WaXNpYmlsaXR5RmVhdHVyZS5EZWZhdWx0U3ltYm9sVmlzaWJpbGl0eS5cbiAqL1xuZXhwb3J0IGNvbnN0IEZlYXR1cmVTZXRfVmlzaWJpbGl0eUZlYXR1cmVfRGVmYXVsdFN5bWJvbFZpc2liaWxpdHlTY2hlbWEgPSAvKkBfX1BVUkVfXyovIGVudW1EZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDE5LCAwLCAwKTtcbi8qKlxuICogQGdlbmVyYXRlZCBmcm9tIGVudW0gZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXQuRmllbGRQcmVzZW5jZVxuICovXG5leHBvcnQgdmFyIEZlYXR1cmVTZXRfRmllbGRQcmVzZW5jZTtcbihmdW5jdGlvbiAoRmVhdHVyZVNldF9GaWVsZFByZXNlbmNlKSB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IEZJRUxEX1BSRVNFTkNFX1VOS05PV04gPSAwO1xuICAgICAqL1xuICAgIEZlYXR1cmVTZXRfRmllbGRQcmVzZW5jZVtGZWF0dXJlU2V0X0ZpZWxkUHJlc2VuY2VbXCJGSUVMRF9QUkVTRU5DRV9VTktOT1dOXCJdID0gMF0gPSBcIkZJRUxEX1BSRVNFTkNFX1VOS05PV05cIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogRVhQTElDSVQgPSAxO1xuICAgICAqL1xuICAgIEZlYXR1cmVTZXRfRmllbGRQcmVzZW5jZVtGZWF0dXJlU2V0X0ZpZWxkUHJlc2VuY2VbXCJFWFBMSUNJVFwiXSA9IDFdID0gXCJFWFBMSUNJVFwiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBJTVBMSUNJVCA9IDI7XG4gICAgICovXG4gICAgRmVhdHVyZVNldF9GaWVsZFByZXNlbmNlW0ZlYXR1cmVTZXRfRmllbGRQcmVzZW5jZVtcIklNUExJQ0lUXCJdID0gMl0gPSBcIklNUExJQ0lUXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IExFR0FDWV9SRVFVSVJFRCA9IDM7XG4gICAgICovXG4gICAgRmVhdHVyZVNldF9GaWVsZFByZXNlbmNlW0ZlYXR1cmVTZXRfRmllbGRQcmVzZW5jZVtcIkxFR0FDWV9SRVFVSVJFRFwiXSA9IDNdID0gXCJMRUdBQ1lfUkVRVUlSRURcIjtcbn0pKEZlYXR1cmVTZXRfRmllbGRQcmVzZW5jZSB8fCAoRmVhdHVyZVNldF9GaWVsZFByZXNlbmNlID0ge30pKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LkZpZWxkUHJlc2VuY2UuXG4gKi9cbmV4cG9ydCBjb25zdCBGZWF0dXJlU2V0X0ZpZWxkUHJlc2VuY2VTY2hlbWEgPSAvKkBfX1BVUkVfXyovIGVudW1EZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDE5LCAwKTtcbi8qKlxuICogQGdlbmVyYXRlZCBmcm9tIGVudW0gZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXQuRW51bVR5cGVcbiAqL1xuZXhwb3J0IHZhciBGZWF0dXJlU2V0X0VudW1UeXBlO1xuKGZ1bmN0aW9uIChGZWF0dXJlU2V0X0VudW1UeXBlKSB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IEVOVU1fVFlQRV9VTktOT1dOID0gMDtcbiAgICAgKi9cbiAgICBGZWF0dXJlU2V0X0VudW1UeXBlW0ZlYXR1cmVTZXRfRW51bVR5cGVbXCJFTlVNX1RZUEVfVU5LTk9XTlwiXSA9IDBdID0gXCJFTlVNX1RZUEVfVU5LTk9XTlwiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBPUEVOID0gMTtcbiAgICAgKi9cbiAgICBGZWF0dXJlU2V0X0VudW1UeXBlW0ZlYXR1cmVTZXRfRW51bVR5cGVbXCJPUEVOXCJdID0gMV0gPSBcIk9QRU5cIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogQ0xPU0VEID0gMjtcbiAgICAgKi9cbiAgICBGZWF0dXJlU2V0X0VudW1UeXBlW0ZlYXR1cmVTZXRfRW51bVR5cGVbXCJDTE9TRURcIl0gPSAyXSA9IFwiQ0xPU0VEXCI7XG59KShGZWF0dXJlU2V0X0VudW1UeXBlIHx8IChGZWF0dXJlU2V0X0VudW1UeXBlID0ge30pKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LkVudW1UeXBlLlxuICovXG5leHBvcnQgY29uc3QgRmVhdHVyZVNldF9FbnVtVHlwZVNjaGVtYSA9IC8qQF9fUFVSRV9fKi8gZW51bURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMTksIDEpO1xuLyoqXG4gKiBAZ2VuZXJhdGVkIGZyb20gZW51bSBnb29nbGUucHJvdG9idWYuRmVhdHVyZVNldC5SZXBlYXRlZEZpZWxkRW5jb2RpbmdcbiAqL1xuZXhwb3J0IHZhciBGZWF0dXJlU2V0X1JlcGVhdGVkRmllbGRFbmNvZGluZztcbihmdW5jdGlvbiAoRmVhdHVyZVNldF9SZXBlYXRlZEZpZWxkRW5jb2RpbmcpIHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogUkVQRUFURURfRklFTERfRU5DT0RJTkdfVU5LTk9XTiA9IDA7XG4gICAgICovXG4gICAgRmVhdHVyZVNldF9SZXBlYXRlZEZpZWxkRW5jb2RpbmdbRmVhdHVyZVNldF9SZXBlYXRlZEZpZWxkRW5jb2RpbmdbXCJSRVBFQVRFRF9GSUVMRF9FTkNPRElOR19VTktOT1dOXCJdID0gMF0gPSBcIlJFUEVBVEVEX0ZJRUxEX0VOQ09ESU5HX1VOS05PV05cIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogUEFDS0VEID0gMTtcbiAgICAgKi9cbiAgICBGZWF0dXJlU2V0X1JlcGVhdGVkRmllbGRFbmNvZGluZ1tGZWF0dXJlU2V0X1JlcGVhdGVkRmllbGRFbmNvZGluZ1tcIlBBQ0tFRFwiXSA9IDFdID0gXCJQQUNLRURcIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogRVhQQU5ERUQgPSAyO1xuICAgICAqL1xuICAgIEZlYXR1cmVTZXRfUmVwZWF0ZWRGaWVsZEVuY29kaW5nW0ZlYXR1cmVTZXRfUmVwZWF0ZWRGaWVsZEVuY29kaW5nW1wiRVhQQU5ERURcIl0gPSAyXSA9IFwiRVhQQU5ERURcIjtcbn0pKEZlYXR1cmVTZXRfUmVwZWF0ZWRGaWVsZEVuY29kaW5nIHx8IChGZWF0dXJlU2V0X1JlcGVhdGVkRmllbGRFbmNvZGluZyA9IHt9KSk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgZW51bSBnb29nbGUucHJvdG9idWYuRmVhdHVyZVNldC5SZXBlYXRlZEZpZWxkRW5jb2RpbmcuXG4gKi9cbmV4cG9ydCBjb25zdCBGZWF0dXJlU2V0X1JlcGVhdGVkRmllbGRFbmNvZGluZ1NjaGVtYSA9IC8qQF9fUFVSRV9fKi8gZW51bURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMTksIDIpO1xuLyoqXG4gKiBAZ2VuZXJhdGVkIGZyb20gZW51bSBnb29nbGUucHJvdG9idWYuRmVhdHVyZVNldC5VdGY4VmFsaWRhdGlvblxuICovXG5leHBvcnQgdmFyIEZlYXR1cmVTZXRfVXRmOFZhbGlkYXRpb247XG4oZnVuY3Rpb24gKEZlYXR1cmVTZXRfVXRmOFZhbGlkYXRpb24pIHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVVRGOF9WQUxJREFUSU9OX1VOS05PV04gPSAwO1xuICAgICAqL1xuICAgIEZlYXR1cmVTZXRfVXRmOFZhbGlkYXRpb25bRmVhdHVyZVNldF9VdGY4VmFsaWRhdGlvbltcIlVURjhfVkFMSURBVElPTl9VTktOT1dOXCJdID0gMF0gPSBcIlVURjhfVkFMSURBVElPTl9VTktOT1dOXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFZFUklGWSA9IDI7XG4gICAgICovXG4gICAgRmVhdHVyZVNldF9VdGY4VmFsaWRhdGlvbltGZWF0dXJlU2V0X1V0ZjhWYWxpZGF0aW9uW1wiVkVSSUZZXCJdID0gMl0gPSBcIlZFUklGWVwiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBOT05FID0gMztcbiAgICAgKi9cbiAgICBGZWF0dXJlU2V0X1V0ZjhWYWxpZGF0aW9uW0ZlYXR1cmVTZXRfVXRmOFZhbGlkYXRpb25bXCJOT05FXCJdID0gM10gPSBcIk5PTkVcIjtcbn0pKEZlYXR1cmVTZXRfVXRmOFZhbGlkYXRpb24gfHwgKEZlYXR1cmVTZXRfVXRmOFZhbGlkYXRpb24gPSB7fSkpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIGVudW0gZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXQuVXRmOFZhbGlkYXRpb24uXG4gKi9cbmV4cG9ydCBjb25zdCBGZWF0dXJlU2V0X1V0ZjhWYWxpZGF0aW9uU2NoZW1hID0gLypAX19QVVJFX18qLyBlbnVtRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAxOSwgMyk7XG4vKipcbiAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0Lk1lc3NhZ2VFbmNvZGluZ1xuICovXG5leHBvcnQgdmFyIEZlYXR1cmVTZXRfTWVzc2FnZUVuY29kaW5nO1xuKGZ1bmN0aW9uIChGZWF0dXJlU2V0X01lc3NhZ2VFbmNvZGluZykge1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBNRVNTQUdFX0VOQ09ESU5HX1VOS05PV04gPSAwO1xuICAgICAqL1xuICAgIEZlYXR1cmVTZXRfTWVzc2FnZUVuY29kaW5nW0ZlYXR1cmVTZXRfTWVzc2FnZUVuY29kaW5nW1wiTUVTU0FHRV9FTkNPRElOR19VTktOT1dOXCJdID0gMF0gPSBcIk1FU1NBR0VfRU5DT0RJTkdfVU5LTk9XTlwiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBMRU5HVEhfUFJFRklYRUQgPSAxO1xuICAgICAqL1xuICAgIEZlYXR1cmVTZXRfTWVzc2FnZUVuY29kaW5nW0ZlYXR1cmVTZXRfTWVzc2FnZUVuY29kaW5nW1wiTEVOR1RIX1BSRUZJWEVEXCJdID0gMV0gPSBcIkxFTkdUSF9QUkVGSVhFRFwiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBERUxJTUlURUQgPSAyO1xuICAgICAqL1xuICAgIEZlYXR1cmVTZXRfTWVzc2FnZUVuY29kaW5nW0ZlYXR1cmVTZXRfTWVzc2FnZUVuY29kaW5nW1wiREVMSU1JVEVEXCJdID0gMl0gPSBcIkRFTElNSVRFRFwiO1xufSkoRmVhdHVyZVNldF9NZXNzYWdlRW5jb2RpbmcgfHwgKEZlYXR1cmVTZXRfTWVzc2FnZUVuY29kaW5nID0ge30pKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0Lk1lc3NhZ2VFbmNvZGluZy5cbiAqL1xuZXhwb3J0IGNvbnN0IEZlYXR1cmVTZXRfTWVzc2FnZUVuY29kaW5nU2NoZW1hID0gLypAX19QVVJFX18qLyBlbnVtRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAxOSwgNCk7XG4vKipcbiAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0Lkpzb25Gb3JtYXRcbiAqL1xuZXhwb3J0IHZhciBGZWF0dXJlU2V0X0pzb25Gb3JtYXQ7XG4oZnVuY3Rpb24gKEZlYXR1cmVTZXRfSnNvbkZvcm1hdCkge1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBKU09OX0ZPUk1BVF9VTktOT1dOID0gMDtcbiAgICAgKi9cbiAgICBGZWF0dXJlU2V0X0pzb25Gb3JtYXRbRmVhdHVyZVNldF9Kc29uRm9ybWF0W1wiSlNPTl9GT1JNQVRfVU5LTk9XTlwiXSA9IDBdID0gXCJKU09OX0ZPUk1BVF9VTktOT1dOXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IEFMTE9XID0gMTtcbiAgICAgKi9cbiAgICBGZWF0dXJlU2V0X0pzb25Gb3JtYXRbRmVhdHVyZVNldF9Kc29uRm9ybWF0W1wiQUxMT1dcIl0gPSAxXSA9IFwiQUxMT1dcIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogTEVHQUNZX0JFU1RfRUZGT1JUID0gMjtcbiAgICAgKi9cbiAgICBGZWF0dXJlU2V0X0pzb25Gb3JtYXRbRmVhdHVyZVNldF9Kc29uRm9ybWF0W1wiTEVHQUNZX0JFU1RfRUZGT1JUXCJdID0gMl0gPSBcIkxFR0FDWV9CRVNUX0VGRk9SVFwiO1xufSkoRmVhdHVyZVNldF9Kc29uRm9ybWF0IHx8IChGZWF0dXJlU2V0X0pzb25Gb3JtYXQgPSB7fSkpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIGVudW0gZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXQuSnNvbkZvcm1hdC5cbiAqL1xuZXhwb3J0IGNvbnN0IEZlYXR1cmVTZXRfSnNvbkZvcm1hdFNjaGVtYSA9IC8qQF9fUFVSRV9fKi8gZW51bURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMTksIDUpO1xuLyoqXG4gKiBAZ2VuZXJhdGVkIGZyb20gZW51bSBnb29nbGUucHJvdG9idWYuRmVhdHVyZVNldC5FbmZvcmNlTmFtaW5nU3R5bGVcbiAqL1xuZXhwb3J0IHZhciBGZWF0dXJlU2V0X0VuZm9yY2VOYW1pbmdTdHlsZTtcbihmdW5jdGlvbiAoRmVhdHVyZVNldF9FbmZvcmNlTmFtaW5nU3R5bGUpIHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogRU5GT1JDRV9OQU1JTkdfU1RZTEVfVU5LTk9XTiA9IDA7XG4gICAgICovXG4gICAgRmVhdHVyZVNldF9FbmZvcmNlTmFtaW5nU3R5bGVbRmVhdHVyZVNldF9FbmZvcmNlTmFtaW5nU3R5bGVbXCJFTkZPUkNFX05BTUlOR19TVFlMRV9VTktOT1dOXCJdID0gMF0gPSBcIkVORk9SQ0VfTkFNSU5HX1NUWUxFX1VOS05PV05cIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogU1RZTEUyMDI0ID0gMTtcbiAgICAgKi9cbiAgICBGZWF0dXJlU2V0X0VuZm9yY2VOYW1pbmdTdHlsZVtGZWF0dXJlU2V0X0VuZm9yY2VOYW1pbmdTdHlsZVtcIlNUWUxFMjAyNFwiXSA9IDFdID0gXCJTVFlMRTIwMjRcIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogU1RZTEVfTEVHQUNZID0gMjtcbiAgICAgKi9cbiAgICBGZWF0dXJlU2V0X0VuZm9yY2VOYW1pbmdTdHlsZVtGZWF0dXJlU2V0X0VuZm9yY2VOYW1pbmdTdHlsZVtcIlNUWUxFX0xFR0FDWVwiXSA9IDJdID0gXCJTVFlMRV9MRUdBQ1lcIjtcbn0pKEZlYXR1cmVTZXRfRW5mb3JjZU5hbWluZ1N0eWxlIHx8IChGZWF0dXJlU2V0X0VuZm9yY2VOYW1pbmdTdHlsZSA9IHt9KSk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgZW51bSBnb29nbGUucHJvdG9idWYuRmVhdHVyZVNldC5FbmZvcmNlTmFtaW5nU3R5bGUuXG4gKi9cbmV4cG9ydCBjb25zdCBGZWF0dXJlU2V0X0VuZm9yY2VOYW1pbmdTdHlsZVNjaGVtYSA9IC8qQF9fUFVSRV9fKi8gZW51bURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMTksIDYpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLkZlYXR1cmVTZXREZWZhdWx0cy5cbiAqIFVzZSBgY3JlYXRlKEZlYXR1cmVTZXREZWZhdWx0c1NjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgRmVhdHVyZVNldERlZmF1bHRzU2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAyMCk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBnb29nbGUucHJvdG9idWYuRmVhdHVyZVNldERlZmF1bHRzLkZlYXR1cmVTZXRFZGl0aW9uRGVmYXVsdC5cbiAqIFVzZSBgY3JlYXRlKEZlYXR1cmVTZXREZWZhdWx0c19GZWF0dXJlU2V0RWRpdGlvbkRlZmF1bHRTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEZlYXR1cmVTZXREZWZhdWx0c19GZWF0dXJlU2V0RWRpdGlvbkRlZmF1bHRTY2hlbWEgPSAvKkBfX1BVUkVfXyovIG1lc3NhZ2VEZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDIwLCAwKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5Tb3VyY2VDb2RlSW5mby5cbiAqIFVzZSBgY3JlYXRlKFNvdXJjZUNvZGVJbmZvU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBTb3VyY2VDb2RlSW5mb1NjaGVtYSA9IC8qQF9fUFVSRV9fKi8gbWVzc2FnZURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMjEpO1xuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgZ29vZ2xlLnByb3RvYnVmLlNvdXJjZUNvZGVJbmZvLkxvY2F0aW9uLlxuICogVXNlIGBjcmVhdGUoU291cmNlQ29kZUluZm9fTG9jYXRpb25TY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IFNvdXJjZUNvZGVJbmZvX0xvY2F0aW9uU2NoZW1hID0gLypAX19QVVJFX18qLyBtZXNzYWdlRGVzYyhmaWxlX2dvb2dsZV9wcm90b2J1Zl9kZXNjcmlwdG9yLCAyMSwgMCk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBnb29nbGUucHJvdG9idWYuR2VuZXJhdGVkQ29kZUluZm8uXG4gKiBVc2UgYGNyZWF0ZShHZW5lcmF0ZWRDb2RlSW5mb1NjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgR2VuZXJhdGVkQ29kZUluZm9TY2hlbWEgPSAvKkBfX1BVUkVfXyovIG1lc3NhZ2VEZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDIyKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGdvb2dsZS5wcm90b2J1Zi5HZW5lcmF0ZWRDb2RlSW5mby5Bbm5vdGF0aW9uLlxuICogVXNlIGBjcmVhdGUoR2VuZXJhdGVkQ29kZUluZm9fQW5ub3RhdGlvblNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgR2VuZXJhdGVkQ29kZUluZm9fQW5ub3RhdGlvblNjaGVtYSA9IC8qQF9fUFVSRV9fKi8gbWVzc2FnZURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMjIsIDApO1xuLyoqXG4gKiBSZXByZXNlbnRzIHRoZSBpZGVudGlmaWVkIG9iamVjdCdzIGVmZmVjdCBvbiB0aGUgZWxlbWVudCBpbiB0aGUgb3JpZ2luYWxcbiAqIC5wcm90byBmaWxlLlxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5HZW5lcmF0ZWRDb2RlSW5mby5Bbm5vdGF0aW9uLlNlbWFudGljXG4gKi9cbmV4cG9ydCB2YXIgR2VuZXJhdGVkQ29kZUluZm9fQW5ub3RhdGlvbl9TZW1hbnRpYztcbihmdW5jdGlvbiAoR2VuZXJhdGVkQ29kZUluZm9fQW5ub3RhdGlvbl9TZW1hbnRpYykge1xuICAgIC8qKlxuICAgICAqIFRoZXJlIGlzIG5vIGVmZmVjdCBvciB0aGUgZWZmZWN0IGlzIGluZGVzY3JpYmFibGUuXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogTk9ORSA9IDA7XG4gICAgICovXG4gICAgR2VuZXJhdGVkQ29kZUluZm9fQW5ub3RhdGlvbl9TZW1hbnRpY1tHZW5lcmF0ZWRDb2RlSW5mb19Bbm5vdGF0aW9uX1NlbWFudGljW1wiTk9ORVwiXSA9IDBdID0gXCJOT05FXCI7XG4gICAgLyoqXG4gICAgICogVGhlIGVsZW1lbnQgaXMgc2V0IG9yIG90aGVyd2lzZSBtdXRhdGVkLlxuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFNFVCA9IDE7XG4gICAgICovXG4gICAgR2VuZXJhdGVkQ29kZUluZm9fQW5ub3RhdGlvbl9TZW1hbnRpY1tHZW5lcmF0ZWRDb2RlSW5mb19Bbm5vdGF0aW9uX1NlbWFudGljW1wiU0VUXCJdID0gMV0gPSBcIlNFVFwiO1xuICAgIC8qKlxuICAgICAqIEFuIGFsaWFzIHRvIHRoZSBlbGVtZW50IGlzIHJldHVybmVkLlxuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IEFMSUFTID0gMjtcbiAgICAgKi9cbiAgICBHZW5lcmF0ZWRDb2RlSW5mb19Bbm5vdGF0aW9uX1NlbWFudGljW0dlbmVyYXRlZENvZGVJbmZvX0Fubm90YXRpb25fU2VtYW50aWNbXCJBTElBU1wiXSA9IDJdID0gXCJBTElBU1wiO1xufSkoR2VuZXJhdGVkQ29kZUluZm9fQW5ub3RhdGlvbl9TZW1hbnRpYyB8fCAoR2VuZXJhdGVkQ29kZUluZm9fQW5ub3RhdGlvbl9TZW1hbnRpYyA9IHt9KSk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgZW51bSBnb29nbGUucHJvdG9idWYuR2VuZXJhdGVkQ29kZUluZm8uQW5ub3RhdGlvbi5TZW1hbnRpYy5cbiAqL1xuZXhwb3J0IGNvbnN0IEdlbmVyYXRlZENvZGVJbmZvX0Fubm90YXRpb25fU2VtYW50aWNTY2hlbWEgPSAvKkBfX1BVUkVfXyovIGVudW1EZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDIyLCAwLCAwKTtcbi8qKlxuICogVGhlIGZ1bGwgc2V0IG9mIGtub3duIGVkaXRpb25zLlxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5FZGl0aW9uXG4gKi9cbmV4cG9ydCB2YXIgRWRpdGlvbjtcbihmdW5jdGlvbiAoRWRpdGlvbikge1xuICAgIC8qKlxuICAgICAqIEEgcGxhY2Vob2xkZXIgZm9yIGFuIHVua25vd24gZWRpdGlvbiB2YWx1ZS5cbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBFRElUSU9OX1VOS05PV04gPSAwO1xuICAgICAqL1xuICAgIEVkaXRpb25bRWRpdGlvbltcIkVESVRJT05fVU5LTk9XTlwiXSA9IDBdID0gXCJFRElUSU9OX1VOS05PV05cIjtcbiAgICAvKipcbiAgICAgKiBBIHBsYWNlaG9sZGVyIGVkaXRpb24gZm9yIHNwZWNpZnlpbmcgZGVmYXVsdCBiZWhhdmlvcnMgKmJlZm9yZSogYSBmZWF0dXJlXG4gICAgICogd2FzIGZpcnN0IGludHJvZHVjZWQuICBUaGlzIGlzIGVmZmVjdGl2ZWx5IGFuIFwiaW5maW5pdGUgcGFzdFwiLlxuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IEVESVRJT05fTEVHQUNZID0gOTAwO1xuICAgICAqL1xuICAgIEVkaXRpb25bRWRpdGlvbltcIkVESVRJT05fTEVHQUNZXCJdID0gOTAwXSA9IFwiRURJVElPTl9MRUdBQ1lcIjtcbiAgICAvKipcbiAgICAgKiBMZWdhY3kgc3ludGF4IFwiZWRpdGlvbnNcIi4gIFRoZXNlIHByZS1kYXRlIGVkaXRpb25zLCBidXQgYmVoYXZlIG11Y2ggbGlrZVxuICAgICAqIGRpc3RpbmN0IGVkaXRpb25zLiAgVGhlc2UgY2FuJ3QgYmUgdXNlZCB0byBzcGVjaWZ5IHRoZSBlZGl0aW9uIG9mIHByb3RvXG4gICAgICogZmlsZXMsIGJ1dCBmZWF0dXJlIGRlZmluaXRpb25zIG11c3Qgc3VwcGx5IHByb3RvMi9wcm90bzMgZGVmYXVsdHMgZm9yXG4gICAgICogYmFja3dhcmRzIGNvbXBhdGliaWxpdHkuXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogRURJVElPTl9QUk9UTzIgPSA5OTg7XG4gICAgICovXG4gICAgRWRpdGlvbltFZGl0aW9uW1wiRURJVElPTl9QUk9UTzJcIl0gPSA5OThdID0gXCJFRElUSU9OX1BST1RPMlwiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBFRElUSU9OX1BST1RPMyA9IDk5OTtcbiAgICAgKi9cbiAgICBFZGl0aW9uW0VkaXRpb25bXCJFRElUSU9OX1BST1RPM1wiXSA9IDk5OV0gPSBcIkVESVRJT05fUFJPVE8zXCI7XG4gICAgLyoqXG4gICAgICogRWRpdGlvbnMgdGhhdCBoYXZlIGJlZW4gcmVsZWFzZWQuICBUaGUgc3BlY2lmaWMgdmFsdWVzIGFyZSBhcmJpdHJhcnkgYW5kXG4gICAgICogc2hvdWxkIG5vdCBiZSBkZXBlbmRlZCBvbiwgYnV0IHRoZXkgd2lsbCBhbHdheXMgYmUgdGltZS1vcmRlcmVkIGZvciBlYXN5XG4gICAgICogY29tcGFyaXNvbi5cbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBFRElUSU9OXzIwMjMgPSAxMDAwO1xuICAgICAqL1xuICAgIEVkaXRpb25bRWRpdGlvbltcIkVESVRJT05fMjAyM1wiXSA9IDEwMDBdID0gXCJFRElUSU9OXzIwMjNcIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogRURJVElPTl8yMDI0ID0gMTAwMTtcbiAgICAgKi9cbiAgICBFZGl0aW9uW0VkaXRpb25bXCJFRElUSU9OXzIwMjRcIl0gPSAxMDAxXSA9IFwiRURJVElPTl8yMDI0XCI7XG4gICAgLyoqXG4gICAgICogUGxhY2Vob2xkZXIgZWRpdGlvbnMgZm9yIHRlc3RpbmcgZmVhdHVyZSByZXNvbHV0aW9uLiAgVGhlc2Ugc2hvdWxkIG5vdCBiZVxuICAgICAqIHVzZWQgb3IgcmVsaWVkIG9uIG91dHNpZGUgb2YgdGVzdHMuXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogRURJVElPTl8xX1RFU1RfT05MWSA9IDE7XG4gICAgICovXG4gICAgRWRpdGlvbltFZGl0aW9uW1wiRURJVElPTl8xX1RFU1RfT05MWVwiXSA9IDFdID0gXCJFRElUSU9OXzFfVEVTVF9PTkxZXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IEVESVRJT05fMl9URVNUX09OTFkgPSAyO1xuICAgICAqL1xuICAgIEVkaXRpb25bRWRpdGlvbltcIkVESVRJT05fMl9URVNUX09OTFlcIl0gPSAyXSA9IFwiRURJVElPTl8yX1RFU1RfT05MWVwiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBFRElUSU9OXzk5OTk3X1RFU1RfT05MWSA9IDk5OTk3O1xuICAgICAqL1xuICAgIEVkaXRpb25bRWRpdGlvbltcIkVESVRJT05fOTk5OTdfVEVTVF9PTkxZXCJdID0gOTk5OTddID0gXCJFRElUSU9OXzk5OTk3X1RFU1RfT05MWVwiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBFRElUSU9OXzk5OTk4X1RFU1RfT05MWSA9IDk5OTk4O1xuICAgICAqL1xuICAgIEVkaXRpb25bRWRpdGlvbltcIkVESVRJT05fOTk5OThfVEVTVF9PTkxZXCJdID0gOTk5OThdID0gXCJFRElUSU9OXzk5OTk4X1RFU1RfT05MWVwiO1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBFRElUSU9OXzk5OTk5X1RFU1RfT05MWSA9IDk5OTk5O1xuICAgICAqL1xuICAgIEVkaXRpb25bRWRpdGlvbltcIkVESVRJT05fOTk5OTlfVEVTVF9PTkxZXCJdID0gOTk5OTldID0gXCJFRElUSU9OXzk5OTk5X1RFU1RfT05MWVwiO1xuICAgIC8qKlxuICAgICAqIFBsYWNlaG9sZGVyIGZvciBzcGVjaWZ5aW5nIHVuYm91bmRlZCBlZGl0aW9uIHN1cHBvcnQuICBUaGlzIHNob3VsZCBvbmx5XG4gICAgICogZXZlciBiZSB1c2VkIGJ5IHBsdWdpbnMgdGhhdCBjYW4gZXhwZWN0IHRvIG5ldmVyIHJlcXVpcmUgYW55IGNoYW5nZXMgdG9cbiAgICAgKiBzdXBwb3J0IGEgbmV3IGVkaXRpb24uXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogRURJVElPTl9NQVggPSAyMTQ3NDgzNjQ3O1xuICAgICAqL1xuICAgIEVkaXRpb25bRWRpdGlvbltcIkVESVRJT05fTUFYXCJdID0gMjE0NzQ4MzY0N10gPSBcIkVESVRJT05fTUFYXCI7XG59KShFZGl0aW9uIHx8IChFZGl0aW9uID0ge30pKTtcbi8qKlxuICogRGVzY3JpYmVzIHRoZSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5FZGl0aW9uLlxuICovXG5leHBvcnQgY29uc3QgRWRpdGlvblNjaGVtYSA9IC8qQF9fUFVSRV9fKi8gZW51bURlc2MoZmlsZV9nb29nbGVfcHJvdG9idWZfZGVzY3JpcHRvciwgMCk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgJ3Zpc2liaWxpdHknIG9mIGEgc3ltYm9sIHdpdGggcmVzcGVjdCB0byB0aGUgcHJvdG8gaW1wb3J0XG4gKiBzeXN0ZW0uIFN5bWJvbHMgY2FuIG9ubHkgYmUgaW1wb3J0ZWQgd2hlbiB0aGUgdmlzaWJpbGl0eSBydWxlcyBkbyBub3QgcHJldmVudFxuICogaXQgKGV4OiBsb2NhbCBzeW1ib2xzIGNhbm5vdCBiZSBpbXBvcnRlZCkuICBWaXNpYmlsaXR5IG1vZGlmaWVycyBjYW4gb25seSBzZXRcbiAqIG9uIGBtZXNzYWdlYCBhbmQgYGVudW1gIGFzIHRoZXkgYXJlIHRoZSBvbmx5IHR5cGVzIGF2YWlsYWJsZSB0byBiZSByZWZlcmVuY2VkXG4gKiBmcm9tIG90aGVyIGZpbGVzLlxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIGdvb2dsZS5wcm90b2J1Zi5TeW1ib2xWaXNpYmlsaXR5XG4gKi9cbmV4cG9ydCB2YXIgU3ltYm9sVmlzaWJpbGl0eTtcbihmdW5jdGlvbiAoU3ltYm9sVmlzaWJpbGl0eSkge1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBWSVNJQklMSVRZX1VOU0VUID0gMDtcbiAgICAgKi9cbiAgICBTeW1ib2xWaXNpYmlsaXR5W1N5bWJvbFZpc2liaWxpdHlbXCJWSVNJQklMSVRZX1VOU0VUXCJdID0gMF0gPSBcIlZJU0lCSUxJVFlfVU5TRVRcIjtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVklTSUJJTElUWV9MT0NBTCA9IDE7XG4gICAgICovXG4gICAgU3ltYm9sVmlzaWJpbGl0eVtTeW1ib2xWaXNpYmlsaXR5W1wiVklTSUJJTElUWV9MT0NBTFwiXSA9IDFdID0gXCJWSVNJQklMSVRZX0xPQ0FMXCI7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFZJU0lCSUxJVFlfRVhQT1JUID0gMjtcbiAgICAgKi9cbiAgICBTeW1ib2xWaXNpYmlsaXR5W1N5bWJvbFZpc2liaWxpdHlbXCJWSVNJQklMSVRZX0VYUE9SVFwiXSA9IDJdID0gXCJWSVNJQklMSVRZX0VYUE9SVFwiO1xufSkoU3ltYm9sVmlzaWJpbGl0eSB8fCAoU3ltYm9sVmlzaWJpbGl0eSA9IHt9KSk7XG4vKipcbiAqIERlc2NyaWJlcyB0aGUgZW51bSBnb29nbGUucHJvdG9idWYuU3ltYm9sVmlzaWJpbGl0eS5cbiAqL1xuZXhwb3J0IGNvbnN0IFN5bWJvbFZpc2liaWxpdHlTY2hlbWEgPSAvKkBfX1BVUkVfXyovIGVudW1EZXNjKGZpbGVfZ29vZ2xlX3Byb3RvYnVmX2Rlc2NyaXB0b3IsIDEpO1xuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5pbXBvcnQgeyBwcm90b0NhbWVsQ2FzZSB9IGZyb20gXCIuLi9yZWZsZWN0L25hbWVzLmpzXCI7XG5pbXBvcnQgeyBpc0ZpZWxkU2V0LCBjbGVhckZpZWxkIH0gZnJvbSBcIi4uL2ZpZWxkcy5qc1wiO1xuaW1wb3J0IHsgYmFzZTY0RW5jb2RlIH0gZnJvbSBcIi4uL3dpcmUvYmFzZTY0LWVuY29kaW5nLmpzXCI7XG5pbXBvcnQgeyB0b0JpbmFyeSB9IGZyb20gXCIuLi90by1iaW5hcnkuanNcIjtcbmltcG9ydCB7IGNsb25lIH0gZnJvbSBcIi4uL2Nsb25lLmpzXCI7XG5pbXBvcnQgeyBFZGl0aW9uLCBGaWVsZERlc2NyaXB0b3JQcm90b1NjaGVtYSwgRmllbGRPcHRpb25zU2NoZW1hLCBGaWxlRGVzY3JpcHRvclByb3RvU2NoZW1hLCBEZXNjcmlwdG9yUHJvdG9TY2hlbWEsIEVudW1EZXNjcmlwdG9yUHJvdG9TY2hlbWEsIH0gZnJvbSBcIi4uL3drdC9nZW4vZ29vZ2xlL3Byb3RvYnVmL2Rlc2NyaXB0b3JfcGIuanNcIjtcbi8qKlxuICogQ3JlYXRlIG5lY2Vzc2FyeSBpbmZvcm1hdGlvbiB0byBlbWJlZCBhIGZpbGUgZGVzY3JpcHRvciBpblxuICogZ2VuZXJhdGVkIGNvZGUuXG4gKlxuICogQHByaXZhdGVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVtYmVkRmlsZURlc2MoZmlsZSkge1xuICAgIGNvbnN0IGVtYmVkID0ge1xuICAgICAgICBib290YWJsZTogZmFsc2UsXG4gICAgICAgIHByb3RvKCkge1xuICAgICAgICAgICAgY29uc3Qgc3RyaXBwZWQgPSBjbG9uZShGaWxlRGVzY3JpcHRvclByb3RvU2NoZW1hLCBmaWxlKTtcbiAgICAgICAgICAgIGNsZWFyRmllbGQoc3RyaXBwZWQsIEZpbGVEZXNjcmlwdG9yUHJvdG9TY2hlbWEuZmllbGQuZGVwZW5kZW5jeSk7XG4gICAgICAgICAgICBjbGVhckZpZWxkKHN0cmlwcGVkLCBGaWxlRGVzY3JpcHRvclByb3RvU2NoZW1hLmZpZWxkLnNvdXJjZUNvZGVJbmZvKTtcbiAgICAgICAgICAgIHN0cmlwcGVkLm1lc3NhZ2VUeXBlLm1hcChzdHJpcEpzb25OYW1lcyk7XG4gICAgICAgICAgICByZXR1cm4gc3RyaXBwZWQ7XG4gICAgICAgIH0sXG4gICAgICAgIGJhc2U2NCgpIHtcbiAgICAgICAgICAgIGNvbnN0IGJ5dGVzID0gdG9CaW5hcnkoRmlsZURlc2NyaXB0b3JQcm90b1NjaGVtYSwgdGhpcy5wcm90bygpKTtcbiAgICAgICAgICAgIHJldHVybiBiYXNlNjRFbmNvZGUoYnl0ZXMsIFwic3RkX3Jhd1wiKTtcbiAgICAgICAgfSxcbiAgICB9O1xuICAgIHJldHVybiBmaWxlLm5hbWUgPT0gXCJnb29nbGUvcHJvdG9idWYvZGVzY3JpcHRvci5wcm90b1wiXG4gICAgICAgID8gT2JqZWN0LmFzc2lnbihPYmplY3QuYXNzaWduKHt9LCBlbWJlZCksIHsgYm9vdGFibGU6IHRydWUsIGJvb3QoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNyZWF0ZUZpbGVEZXNjcmlwdG9yUHJvdG9Cb290KHRoaXMucHJvdG8oKSk7XG4gICAgICAgICAgICB9IH0pIDogZW1iZWQ7XG59XG5mdW5jdGlvbiBzdHJpcEpzb25OYW1lcyhkKSB7XG4gICAgZm9yIChjb25zdCBmIG9mIGQuZmllbGQpIHtcbiAgICAgICAgaWYgKGYuanNvbk5hbWUgPT09IHByb3RvQ2FtZWxDYXNlKGYubmFtZSkpIHtcbiAgICAgICAgICAgIGNsZWFyRmllbGQoZiwgRmllbGREZXNjcmlwdG9yUHJvdG9TY2hlbWEuZmllbGQuanNvbk5hbWUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgbiBvZiBkLm5lc3RlZFR5cGUpIHtcbiAgICAgICAgc3RyaXBKc29uTmFtZXMobik7XG4gICAgfVxufVxuLyoqXG4gKiBDb21wdXRlIHRoZSBwYXRoIHRvIGEgbWVzc2FnZSwgZW51bWVyYXRpb24sIGV4dGVuc2lvbiwgb3Igc2VydmljZSBpbiBhXG4gKiBmaWxlIGRlc2NyaXB0b3IuXG4gKlxuICogQHByaXZhdGVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhdGhJbkZpbGVEZXNjKGRlc2MpIHtcbiAgICBpZiAoZGVzYy5raW5kID09IFwic2VydmljZVwiKSB7XG4gICAgICAgIHJldHVybiBbZGVzYy5maWxlLnNlcnZpY2VzLmluZGV4T2YoZGVzYyldO1xuICAgIH1cbiAgICBjb25zdCBwYXJlbnQgPSBkZXNjLnBhcmVudDtcbiAgICBpZiAocGFyZW50ID09IHVuZGVmaW5lZCkge1xuICAgICAgICBzd2l0Y2ggKGRlc2Mua2luZCkge1xuICAgICAgICAgICAgY2FzZSBcImVudW1cIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gW2Rlc2MuZmlsZS5lbnVtcy5pbmRleE9mKGRlc2MpXTtcbiAgICAgICAgICAgIGNhc2UgXCJtZXNzYWdlXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIFtkZXNjLmZpbGUubWVzc2FnZXMuaW5kZXhPZihkZXNjKV07XG4gICAgICAgICAgICBjYXNlIFwiZXh0ZW5zaW9uXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIFtkZXNjLmZpbGUuZXh0ZW5zaW9ucy5pbmRleE9mKGRlc2MpXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBmdW5jdGlvbiBmaW5kUGF0aChjdXIpIHtcbiAgICAgICAgY29uc3QgbmVzdGVkID0gW107XG4gICAgICAgIGZvciAobGV0IHBhcmVudCA9IGN1ci5wYXJlbnQ7IHBhcmVudDspIHtcbiAgICAgICAgICAgIGNvbnN0IGlkeCA9IHBhcmVudC5uZXN0ZWRNZXNzYWdlcy5pbmRleE9mKGN1cik7XG4gICAgICAgICAgICBuZXN0ZWQudW5zaGlmdChpZHgpO1xuICAgICAgICAgICAgY3VyID0gcGFyZW50O1xuICAgICAgICAgICAgcGFyZW50ID0gY3VyLnBhcmVudDtcbiAgICAgICAgfVxuICAgICAgICBuZXN0ZWQudW5zaGlmdChjdXIuZmlsZS5tZXNzYWdlcy5pbmRleE9mKGN1cikpO1xuICAgICAgICByZXR1cm4gbmVzdGVkO1xuICAgIH1cbiAgICBjb25zdCBwYXRoID0gZmluZFBhdGgocGFyZW50KTtcbiAgICBzd2l0Y2ggKGRlc2Mua2luZCkge1xuICAgICAgICBjYXNlIFwiZXh0ZW5zaW9uXCI6XG4gICAgICAgICAgICByZXR1cm4gWy4uLnBhdGgsIHBhcmVudC5uZXN0ZWRFeHRlbnNpb25zLmluZGV4T2YoZGVzYyldO1xuICAgICAgICBjYXNlIFwibWVzc2FnZVwiOlxuICAgICAgICAgICAgcmV0dXJuIFsuLi5wYXRoLCBwYXJlbnQubmVzdGVkTWVzc2FnZXMuaW5kZXhPZihkZXNjKV07XG4gICAgICAgIGNhc2UgXCJlbnVtXCI6XG4gICAgICAgICAgICByZXR1cm4gWy4uLnBhdGgsIHBhcmVudC5uZXN0ZWRFbnVtcy5pbmRleE9mKGRlc2MpXTtcbiAgICB9XG59XG4vKipcbiAqIFRoZSBmaWxlIGRlc2NyaXB0b3IgZm9yIGdvb2dsZS9wcm90b2J1Zi9kZXNjcmlwdG9yLnByb3RvIGNhbm5vdCBiZSBlbWJlZGRlZFxuICogaW4gc2VyaWFsaXplZCBmb3JtLCBzaW5jZSBpdCBpcyByZXF1aXJlZCB0byBwYXJzZSBpdHNlbGYuXG4gKlxuICogVGhpcyBmdW5jdGlvbiB0YWtlcyBhbiBpbnN0YW5jZSBvZiB0aGUgbWVzc2FnZSwgYW5kIHJldHVybnMgYSBwbGFpbiBvYmplY3RcbiAqIHRoYXQgY2FuIGJlIGh5ZHJhdGVkIHRvIHRoZSBtZXNzYWdlIGFnYWluIHZpYSBib290RmlsZURlc2NyaXB0b3JQcm90bygpLlxuICpcbiAqIFRoaXMgZnVuY3Rpb24gb25seSB3b3JrcyB3aXRoIGEgbWVzc2FnZSBnb29nbGUucHJvdG9idWYuRmlsZURlc2NyaXB0b3JQcm90b1xuICogZm9yIGdvb2dsZS9wcm90b2J1Zi9kZXNjcmlwdG9yLnByb3RvLCBhbmQgb25seSBzdXBwb3J0cyBmZWF0dXJlcyB0aGF0IGFyZVxuICogcmVsZXZhbnQgZm9yIHRoZSBzcGVjaWZpYyB1c2UgY2FzZS4gRm9yIGV4YW1wbGUsIGl0IGRpc2NhcmRzIGZpbGUgb3B0aW9ucyxcbiAqIHJlc2VydmVkIHJhbmdlcyBhbmQgcmVzZXJ2ZWQgbmFtZXMsIGFuZCBmaWVsZCBvcHRpb25zIHRoYXQgYXJlIHVudXNlZCBpblxuICogZGVzY3JpcHRvci5wcm90by5cbiAqXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRmlsZURlc2NyaXB0b3JQcm90b0Jvb3QocHJvdG8pIHtcbiAgICB2YXIgX2E7XG4gICAgYXNzZXJ0KHByb3RvLm5hbWUgPT0gXCJnb29nbGUvcHJvdG9idWYvZGVzY3JpcHRvci5wcm90b1wiKTtcbiAgICBhc3NlcnQocHJvdG8ucGFja2FnZSA9PSBcImdvb2dsZS5wcm90b2J1ZlwiKTtcbiAgICBhc3NlcnQoIXByb3RvLmRlcGVuZGVuY3kubGVuZ3RoKTtcbiAgICBhc3NlcnQoIXByb3RvLnB1YmxpY0RlcGVuZGVuY3kubGVuZ3RoKTtcbiAgICBhc3NlcnQoIXByb3RvLndlYWtEZXBlbmRlbmN5Lmxlbmd0aCk7XG4gICAgYXNzZXJ0KCFwcm90by5vcHRpb25EZXBlbmRlbmN5Lmxlbmd0aCk7XG4gICAgYXNzZXJ0KCFwcm90by5zZXJ2aWNlLmxlbmd0aCk7XG4gICAgYXNzZXJ0KCFwcm90by5leHRlbnNpb24ubGVuZ3RoKTtcbiAgICBhc3NlcnQocHJvdG8uc291cmNlQ29kZUluZm8gPT09IHVuZGVmaW5lZCk7XG4gICAgYXNzZXJ0KHByb3RvLnN5bnRheCA9PSBcIlwiIHx8IHByb3RvLnN5bnRheCA9PSBcInByb3RvMlwiKTtcbiAgICBhc3NlcnQoISgoX2EgPSBwcm90by5vcHRpb25zKSA9PT0gbnVsbCB8fCBfYSA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2EuZmVhdHVyZXMpKTsgLy8gd2UncmUgZHJvcHBpbmcgZmlsZSBvcHRpb25zXG4gICAgYXNzZXJ0KHByb3RvLmVkaXRpb24gPT09IEVkaXRpb24uRURJVElPTl9VTktOT1dOKTtcbiAgICByZXR1cm4ge1xuICAgICAgICBuYW1lOiBwcm90by5uYW1lLFxuICAgICAgICBwYWNrYWdlOiBwcm90by5wYWNrYWdlLFxuICAgICAgICBtZXNzYWdlVHlwZTogcHJvdG8ubWVzc2FnZVR5cGUubWFwKGNyZWF0ZURlc2NyaXB0b3JCb290KSxcbiAgICAgICAgZW51bVR5cGU6IHByb3RvLmVudW1UeXBlLm1hcChjcmVhdGVFbnVtRGVzY3JpcHRvckJvb3QpLFxuICAgIH07XG59XG5mdW5jdGlvbiBjcmVhdGVEZXNjcmlwdG9yQm9vdChwcm90bykge1xuICAgIGFzc2VydChwcm90by5leHRlbnNpb24ubGVuZ3RoID09IDApO1xuICAgIGFzc2VydCghcHJvdG8ub25lb2ZEZWNsLmxlbmd0aCk7XG4gICAgYXNzZXJ0KCFwcm90by5vcHRpb25zKTtcbiAgICBhc3NlcnQoIWlzRmllbGRTZXQocHJvdG8sIERlc2NyaXB0b3JQcm90b1NjaGVtYS5maWVsZC52aXNpYmlsaXR5KSk7XG4gICAgY29uc3QgYiA9IHtcbiAgICAgICAgbmFtZTogcHJvdG8ubmFtZSxcbiAgICB9O1xuICAgIGlmIChwcm90by5maWVsZC5sZW5ndGgpIHtcbiAgICAgICAgYi5maWVsZCA9IHByb3RvLmZpZWxkLm1hcChjcmVhdGVGaWVsZERlc2NyaXB0b3JCb290KTtcbiAgICB9XG4gICAgaWYgKHByb3RvLm5lc3RlZFR5cGUubGVuZ3RoKSB7XG4gICAgICAgIGIubmVzdGVkVHlwZSA9IHByb3RvLm5lc3RlZFR5cGUubWFwKGNyZWF0ZURlc2NyaXB0b3JCb290KTtcbiAgICB9XG4gICAgaWYgKHByb3RvLmVudW1UeXBlLmxlbmd0aCkge1xuICAgICAgICBiLmVudW1UeXBlID0gcHJvdG8uZW51bVR5cGUubWFwKGNyZWF0ZUVudW1EZXNjcmlwdG9yQm9vdCk7XG4gICAgfVxuICAgIGlmIChwcm90by5leHRlbnNpb25SYW5nZS5sZW5ndGgpIHtcbiAgICAgICAgYi5leHRlbnNpb25SYW5nZSA9IHByb3RvLmV4dGVuc2lvblJhbmdlLm1hcCgocikgPT4ge1xuICAgICAgICAgICAgYXNzZXJ0KCFyLm9wdGlvbnMpO1xuICAgICAgICAgICAgcmV0dXJuIHsgc3RhcnQ6IHIuc3RhcnQsIGVuZDogci5lbmQgfTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBiO1xufVxuZnVuY3Rpb24gY3JlYXRlRmllbGREZXNjcmlwdG9yQm9vdChwcm90bykge1xuICAgIGFzc2VydChpc0ZpZWxkU2V0KHByb3RvLCBGaWVsZERlc2NyaXB0b3JQcm90b1NjaGVtYS5maWVsZC5uYW1lKSk7XG4gICAgYXNzZXJ0KGlzRmllbGRTZXQocHJvdG8sIEZpZWxkRGVzY3JpcHRvclByb3RvU2NoZW1hLmZpZWxkLm51bWJlcikpO1xuICAgIGFzc2VydChpc0ZpZWxkU2V0KHByb3RvLCBGaWVsZERlc2NyaXB0b3JQcm90b1NjaGVtYS5maWVsZC50eXBlKSk7XG4gICAgYXNzZXJ0KCFpc0ZpZWxkU2V0KHByb3RvLCBGaWVsZERlc2NyaXB0b3JQcm90b1NjaGVtYS5maWVsZC5vbmVvZkluZGV4KSk7XG4gICAgYXNzZXJ0KCFpc0ZpZWxkU2V0KHByb3RvLCBGaWVsZERlc2NyaXB0b3JQcm90b1NjaGVtYS5maWVsZC5qc29uTmFtZSkgfHxcbiAgICAgICAgcHJvdG8uanNvbk5hbWUgPT09IHByb3RvQ2FtZWxDYXNlKHByb3RvLm5hbWUpKTtcbiAgICBjb25zdCBiID0ge1xuICAgICAgICBuYW1lOiBwcm90by5uYW1lLFxuICAgICAgICBudW1iZXI6IHByb3RvLm51bWJlcixcbiAgICAgICAgdHlwZTogcHJvdG8udHlwZSxcbiAgICB9O1xuICAgIGlmIChpc0ZpZWxkU2V0KHByb3RvLCBGaWVsZERlc2NyaXB0b3JQcm90b1NjaGVtYS5maWVsZC5sYWJlbCkpIHtcbiAgICAgICAgYi5sYWJlbCA9IHByb3RvLmxhYmVsO1xuICAgIH1cbiAgICBpZiAoaXNGaWVsZFNldChwcm90bywgRmllbGREZXNjcmlwdG9yUHJvdG9TY2hlbWEuZmllbGQudHlwZU5hbWUpKSB7XG4gICAgICAgIGIudHlwZU5hbWUgPSBwcm90by50eXBlTmFtZTtcbiAgICB9XG4gICAgaWYgKGlzRmllbGRTZXQocHJvdG8sIEZpZWxkRGVzY3JpcHRvclByb3RvU2NoZW1hLmZpZWxkLmV4dGVuZGVlKSkge1xuICAgICAgICBiLmV4dGVuZGVlID0gcHJvdG8uZXh0ZW5kZWU7XG4gICAgfVxuICAgIGlmIChpc0ZpZWxkU2V0KHByb3RvLCBGaWVsZERlc2NyaXB0b3JQcm90b1NjaGVtYS5maWVsZC5kZWZhdWx0VmFsdWUpKSB7XG4gICAgICAgIGIuZGVmYXVsdFZhbHVlID0gcHJvdG8uZGVmYXVsdFZhbHVlO1xuICAgIH1cbiAgICBpZiAocHJvdG8ub3B0aW9ucykge1xuICAgICAgICBiLm9wdGlvbnMgPSBjcmVhdGVGaWVsZE9wdGlvbnNCb290KHByb3RvLm9wdGlvbnMpO1xuICAgIH1cbiAgICByZXR1cm4gYjtcbn1cbmZ1bmN0aW9uIGNyZWF0ZUZpZWxkT3B0aW9uc0Jvb3QocHJvdG8pIHtcbiAgICBjb25zdCBiID0ge307XG4gICAgYXNzZXJ0KCFpc0ZpZWxkU2V0KHByb3RvLCBGaWVsZE9wdGlvbnNTY2hlbWEuZmllbGQuY3R5cGUpKTtcbiAgICBpZiAoaXNGaWVsZFNldChwcm90bywgRmllbGRPcHRpb25zU2NoZW1hLmZpZWxkLnBhY2tlZCkpIHtcbiAgICAgICAgYi5wYWNrZWQgPSBwcm90by5wYWNrZWQ7XG4gICAgfVxuICAgIGFzc2VydCghaXNGaWVsZFNldChwcm90bywgRmllbGRPcHRpb25zU2NoZW1hLmZpZWxkLmpzdHlwZSkpO1xuICAgIGFzc2VydCghaXNGaWVsZFNldChwcm90bywgRmllbGRPcHRpb25zU2NoZW1hLmZpZWxkLmxhenkpKTtcbiAgICBhc3NlcnQoIWlzRmllbGRTZXQocHJvdG8sIEZpZWxkT3B0aW9uc1NjaGVtYS5maWVsZC51bnZlcmlmaWVkTGF6eSkpO1xuICAgIGlmIChpc0ZpZWxkU2V0KHByb3RvLCBGaWVsZE9wdGlvbnNTY2hlbWEuZmllbGQuZGVwcmVjYXRlZCkpIHtcbiAgICAgICAgYi5kZXByZWNhdGVkID0gcHJvdG8uZGVwcmVjYXRlZDtcbiAgICB9XG4gICAgYXNzZXJ0KCFpc0ZpZWxkU2V0KHByb3RvLCBGaWVsZE9wdGlvbnNTY2hlbWEuZmllbGQud2VhaykpO1xuICAgIGFzc2VydCghaXNGaWVsZFNldChwcm90bywgRmllbGRPcHRpb25zU2NoZW1hLmZpZWxkLmRlYnVnUmVkYWN0KSk7XG4gICAgaWYgKGlzRmllbGRTZXQocHJvdG8sIEZpZWxkT3B0aW9uc1NjaGVtYS5maWVsZC5yZXRlbnRpb24pKSB7XG4gICAgICAgIGIucmV0ZW50aW9uID0gcHJvdG8ucmV0ZW50aW9uO1xuICAgIH1cbiAgICBpZiAocHJvdG8udGFyZ2V0cy5sZW5ndGgpIHtcbiAgICAgICAgYi50YXJnZXRzID0gcHJvdG8udGFyZ2V0cztcbiAgICB9XG4gICAgaWYgKHByb3RvLmVkaXRpb25EZWZhdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgYi5lZGl0aW9uRGVmYXVsdHMgPSBwcm90by5lZGl0aW9uRGVmYXVsdHMubWFwKChkKSA9PiAoe1xuICAgICAgICAgICAgdmFsdWU6IGQudmFsdWUsXG4gICAgICAgICAgICBlZGl0aW9uOiBkLmVkaXRpb24sXG4gICAgICAgIH0pKTtcbiAgICB9XG4gICAgYXNzZXJ0KCFpc0ZpZWxkU2V0KHByb3RvLCBGaWVsZE9wdGlvbnNTY2hlbWEuZmllbGQuZmVhdHVyZXMpKTtcbiAgICBhc3NlcnQoIWlzRmllbGRTZXQocHJvdG8sIEZpZWxkT3B0aW9uc1NjaGVtYS5maWVsZC51bmludGVycHJldGVkT3B0aW9uKSk7XG4gICAgcmV0dXJuIGI7XG59XG5mdW5jdGlvbiBjcmVhdGVFbnVtRGVzY3JpcHRvckJvb3QocHJvdG8pIHtcbiAgICBhc3NlcnQoIXByb3RvLm9wdGlvbnMpO1xuICAgIGFzc2VydCghaXNGaWVsZFNldChwcm90bywgRW51bURlc2NyaXB0b3JQcm90b1NjaGVtYS5maWVsZC52aXNpYmlsaXR5KSk7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgbmFtZTogcHJvdG8ubmFtZSxcbiAgICAgICAgdmFsdWU6IHByb3RvLnZhbHVlLm1hcCgodikgPT4ge1xuICAgICAgICAgICAgYXNzZXJ0KCF2Lm9wdGlvbnMpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBuYW1lOiB2Lm5hbWUsXG4gICAgICAgICAgICAgICAgbnVtYmVyOiB2Lm51bWJlcixcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pLFxuICAgIH07XG59XG4vKipcbiAqIEFzc2VydCB0aGF0IGNvbmRpdGlvbiBpcyB0cnV0aHkgb3IgdGhyb3cgZXJyb3IuXG4gKi9cbmZ1bmN0aW9uIGFzc2VydChjb25kaXRpb24pIHtcbiAgICBpZiAoIWNvbmRpdGlvbikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoKTtcbiAgICB9XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbi8qKlxuICogSHlkcmF0ZSBhbiBleHRlbnNpb24gZGVzY3JpcHRvci5cbiAqXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gZXh0RGVzYyhmaWxlLCBwYXRoLCAuLi5wYXRocykge1xuICAgIGlmIChwYXRocy5sZW5ndGggPT0gMCkge1xuICAgICAgICByZXR1cm4gZmlsZS5leHRlbnNpb25zW3BhdGhdO1xuICAgIH1cbiAgICBjb25zdCBlID0gcGF0aHMucG9wKCk7IC8vIHdlIGNoZWNrZWQgbGVuZ3RoIGFib3ZlXG4gICAgcmV0dXJuIHBhdGhzLnJlZHVjZSgoYWNjLCBjdXIpID0+IGFjYy5uZXN0ZWRNZXNzYWdlc1tjdXJdLCBmaWxlLm1lc3NhZ2VzW3BhdGhdKS5uZXN0ZWRFeHRlbnNpb25zW2VdO1xufVxuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5pbXBvcnQgeyBTY2FsYXJUeXBlIH0gZnJvbSBcIi4vZGVzY3JpcHRvcnMuanNcIjtcbmltcG9ydCB7IHNjYWxhclplcm9WYWx1ZSB9IGZyb20gXCIuL3JlZmxlY3Qvc2NhbGFyLmpzXCI7XG5pbXBvcnQgeyByZWZsZWN0IH0gZnJvbSBcIi4vcmVmbGVjdC9yZWZsZWN0LmpzXCI7XG5pbXBvcnQgeyBCaW5hcnlSZWFkZXIsIFdpcmVUeXBlIH0gZnJvbSBcIi4vd2lyZS9iaW5hcnktZW5jb2RpbmcuanNcIjtcbmltcG9ydCB7IHZhcmludDMyd3JpdGUgfSBmcm9tIFwiLi93aXJlL3ZhcmludC5qc1wiO1xuLy8gRGVmYXVsdCBvcHRpb25zIGZvciBwYXJzaW5nIGJpbmFyeSBkYXRhLlxuY29uc3QgcmVhZERlZmF1bHRzID0ge1xuICAgIHJlYWRVbmtub3duRmllbGRzOiB0cnVlLFxufTtcbmZ1bmN0aW9uIG1ha2VSZWFkT3B0aW9ucyhvcHRpb25zKSB7XG4gICAgcmV0dXJuIG9wdGlvbnMgPyBPYmplY3QuYXNzaWduKE9iamVjdC5hc3NpZ24oe30sIHJlYWREZWZhdWx0cyksIG9wdGlvbnMpIDogcmVhZERlZmF1bHRzO1xufVxuLyoqXG4gKiBQYXJzZSBzZXJpYWxpemVkIGJpbmFyeSBkYXRhLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZnJvbUJpbmFyeShzY2hlbWEsIGJ5dGVzLCBvcHRpb25zKSB7XG4gICAgY29uc3QgbXNnID0gcmVmbGVjdChzY2hlbWEsIHVuZGVmaW5lZCwgZmFsc2UpO1xuICAgIHJlYWRNZXNzYWdlKG1zZywgbmV3IEJpbmFyeVJlYWRlcihieXRlcyksIG1ha2VSZWFkT3B0aW9ucyhvcHRpb25zKSwgZmFsc2UsIGJ5dGVzLmJ5dGVMZW5ndGgpO1xuICAgIHJldHVybiBtc2cubWVzc2FnZTtcbn1cbi8qKlxuICogUGFyc2UgZnJvbSBiaW5hcnkgZGF0YSwgbWVyZ2luZyBmaWVsZHMuXG4gKlxuICogUmVwZWF0ZWQgZmllbGRzIGFyZSBhcHBlbmRlZC4gTWFwIGVudHJpZXMgYXJlIGFkZGVkLCBvdmVyd3JpdGluZ1xuICogZXhpc3Rpbmcga2V5cy5cbiAqXG4gKiBJZiBhIG1lc3NhZ2UgZmllbGQgaXMgYWxyZWFkeSBwcmVzZW50LCBpdCB3aWxsIGJlIG1lcmdlZCB3aXRoIHRoZVxuICogbmV3IGRhdGEuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZUZyb21CaW5hcnkoc2NoZW1hLCB0YXJnZXQsIGJ5dGVzLCBvcHRpb25zKSB7XG4gICAgcmVhZE1lc3NhZ2UocmVmbGVjdChzY2hlbWEsIHRhcmdldCwgZmFsc2UpLCBuZXcgQmluYXJ5UmVhZGVyKGJ5dGVzKSwgbWFrZVJlYWRPcHRpb25zKG9wdGlvbnMpLCBmYWxzZSwgYnl0ZXMuYnl0ZUxlbmd0aCk7XG4gICAgcmV0dXJuIHRhcmdldDtcbn1cbi8qKlxuICogSWYgYGRlbGltaXRlZGAgaXMgZmFsc2UsIHJlYWQgdGhlIGxlbmd0aCBnaXZlbiBpbiBgbGVuZ3RoT3JEZWxpbWl0ZWRGaWVsZE5vYC5cbiAqXG4gKiBJZiBgZGVsaW1pdGVkYCBpcyB0cnVlLCByZWFkIHVudGlsIGFuIEVuZEdyb3VwIHRhZy4gYGxlbmd0aE9yRGVsaW1pdGVkRmllbGROb2BcbiAqIGlzIHRoZSBleHBlY3RlZCBmaWVsZCBudW1iZXIuXG4gKlxuICogQHByaXZhdGVcbiAqL1xuZnVuY3Rpb24gcmVhZE1lc3NhZ2UobWVzc2FnZSwgcmVhZGVyLCBvcHRpb25zLCBkZWxpbWl0ZWQsIGxlbmd0aE9yRGVsaW1pdGVkRmllbGRObykge1xuICAgIHZhciBfYTtcbiAgICBjb25zdCBlbmQgPSBkZWxpbWl0ZWQgPyByZWFkZXIubGVuIDogcmVhZGVyLnBvcyArIGxlbmd0aE9yRGVsaW1pdGVkRmllbGRObztcbiAgICBsZXQgZmllbGRObztcbiAgICBsZXQgd2lyZVR5cGU7XG4gICAgY29uc3QgdW5rbm93bkZpZWxkcyA9IChfYSA9IG1lc3NhZ2UuZ2V0VW5rbm93bigpKSAhPT0gbnVsbCAmJiBfYSAhPT0gdm9pZCAwID8gX2EgOiBbXTtcbiAgICB3aGlsZSAocmVhZGVyLnBvcyA8IGVuZCkge1xuICAgICAgICBbZmllbGRObywgd2lyZVR5cGVdID0gcmVhZGVyLnRhZygpO1xuICAgICAgICBpZiAoZGVsaW1pdGVkICYmIHdpcmVUeXBlID09IFdpcmVUeXBlLkVuZEdyb3VwKSB7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBmaWVsZCA9IG1lc3NhZ2UuZmluZE51bWJlcihmaWVsZE5vKTtcbiAgICAgICAgaWYgKCFmaWVsZCkge1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IHJlYWRlci5za2lwKHdpcmVUeXBlLCBmaWVsZE5vKTtcbiAgICAgICAgICAgIGlmIChvcHRpb25zLnJlYWRVbmtub3duRmllbGRzKSB7XG4gICAgICAgICAgICAgICAgdW5rbm93bkZpZWxkcy5wdXNoKHsgbm86IGZpZWxkTm8sIHdpcmVUeXBlLCBkYXRhIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgcmVhZEZpZWxkKG1lc3NhZ2UsIHJlYWRlciwgZmllbGQsIHdpcmVUeXBlLCBvcHRpb25zKTtcbiAgICB9XG4gICAgaWYgKGRlbGltaXRlZCkge1xuICAgICAgICBpZiAod2lyZVR5cGUgIT0gV2lyZVR5cGUuRW5kR3JvdXAgfHwgZmllbGRObyAhPT0gbGVuZ3RoT3JEZWxpbWl0ZWRGaWVsZE5vKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbnZhbGlkIGVuZCBncm91cCB0YWdcIik7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHVua25vd25GaWVsZHMubGVuZ3RoID4gMCkge1xuICAgICAgICBtZXNzYWdlLnNldFVua25vd24odW5rbm93bkZpZWxkcyk7XG4gICAgfVxufVxuLyoqXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVhZEZpZWxkKG1lc3NhZ2UsIHJlYWRlciwgZmllbGQsIHdpcmVUeXBlLCBvcHRpb25zKSB7XG4gICAgdmFyIF9hO1xuICAgIHN3aXRjaCAoZmllbGQuZmllbGRLaW5kKSB7XG4gICAgICAgIGNhc2UgXCJzY2FsYXJcIjpcbiAgICAgICAgICAgIG1lc3NhZ2Uuc2V0KGZpZWxkLCByZWFkU2NhbGFyKHJlYWRlciwgZmllbGQuc2NhbGFyKSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImVudW1cIjpcbiAgICAgICAgICAgIGNvbnN0IHZhbCA9IHJlYWRTY2FsYXIocmVhZGVyLCBTY2FsYXJUeXBlLklOVDMyKTtcbiAgICAgICAgICAgIGlmIChmaWVsZC5lbnVtLm9wZW4pIHtcbiAgICAgICAgICAgICAgICBtZXNzYWdlLnNldChmaWVsZCwgdmFsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IG9rID0gZmllbGQuZW51bS52YWx1ZXMuc29tZSgodikgPT4gdi5udW1iZXIgPT09IHZhbCk7XG4gICAgICAgICAgICAgICAgaWYgKG9rKSB7XG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2Uuc2V0KGZpZWxkLCB2YWwpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChvcHRpb25zLnJlYWRVbmtub3duRmllbGRzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJ5dGVzID0gW107XG4gICAgICAgICAgICAgICAgICAgIHZhcmludDMyd3JpdGUodmFsLCBieXRlcyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHVua25vd25GaWVsZHMgPSAoX2EgPSBtZXNzYWdlLmdldFVua25vd24oKSkgIT09IG51bGwgJiYgX2EgIT09IHZvaWQgMCA/IF9hIDogW107XG4gICAgICAgICAgICAgICAgICAgIHVua25vd25GaWVsZHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBubzogZmllbGQubnVtYmVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgd2lyZVR5cGUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiBuZXcgVWludDhBcnJheShieXRlcyksXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlLnNldFVua25vd24odW5rbm93bkZpZWxkcyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJtZXNzYWdlXCI6XG4gICAgICAgICAgICBtZXNzYWdlLnNldChmaWVsZCwgcmVhZE1lc3NhZ2VGaWVsZChyZWFkZXIsIG9wdGlvbnMsIGZpZWxkLCBtZXNzYWdlLmdldChmaWVsZCkpKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwibGlzdFwiOlxuICAgICAgICAgICAgcmVhZExpc3RGaWVsZChyZWFkZXIsIHdpcmVUeXBlLCBtZXNzYWdlLmdldChmaWVsZCksIG9wdGlvbnMpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJtYXBcIjpcbiAgICAgICAgICAgIHJlYWRNYXBFbnRyeShyZWFkZXIsIG1lc3NhZ2UuZ2V0KGZpZWxkKSwgb3B0aW9ucyk7XG4gICAgICAgICAgICBicmVhaztcbiAgICB9XG59XG4vLyBSZWFkIGEgbWFwIGZpZWxkLCBleHBlY3Rpbmcga2V5IGZpZWxkID0gMSwgdmFsdWUgZmllbGQgPSAyXG5mdW5jdGlvbiByZWFkTWFwRW50cnkocmVhZGVyLCBtYXAsIG9wdGlvbnMpIHtcbiAgICBjb25zdCBmaWVsZCA9IG1hcC5maWVsZCgpO1xuICAgIGxldCBrZXk7XG4gICAgbGV0IHZhbDtcbiAgICAvLyBSZWFkIHRoZSBsZW5ndGggb2YgdGhlIG1hcCBlbnRyeSwgd2hpY2ggaXMgYSB2YXJpbnQuXG4gICAgY29uc3QgbGVuID0gcmVhZGVyLnVpbnQzMigpO1xuICAgIC8vIFdBUk5JTkc6IENhbGN1bGF0ZSBlbmQgQUZURVIgYWR2YW5jaW5nIHJlYWRlci5wb3MgKGFib3ZlKSwgc28gdGhhdFxuICAgIC8vICAgICAgICAgIHJlYWRlci5wb3MgaXMgYXQgdGhlIHN0YXJ0IG9mIHRoZSBtYXAgZW50cnkuXG4gICAgY29uc3QgZW5kID0gcmVhZGVyLnBvcyArIGxlbjtcbiAgICB3aGlsZSAocmVhZGVyLnBvcyA8IGVuZCkge1xuICAgICAgICBjb25zdCBbZmllbGROb10gPSByZWFkZXIudGFnKCk7XG4gICAgICAgIHN3aXRjaCAoZmllbGRObykge1xuICAgICAgICAgICAgY2FzZSAxOlxuICAgICAgICAgICAgICAgIGtleSA9IHJlYWRTY2FsYXIocmVhZGVyLCBmaWVsZC5tYXBLZXkpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAyOlxuICAgICAgICAgICAgICAgIHN3aXRjaCAoZmllbGQubWFwS2luZCkge1xuICAgICAgICAgICAgICAgICAgICBjYXNlIFwic2NhbGFyXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSByZWFkU2NhbGFyKHJlYWRlciwgZmllbGQuc2NhbGFyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIFwiZW51bVwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gcmVhZGVyLmludDMyKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcIm1lc3NhZ2VcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IHJlYWRNZXNzYWdlRmllbGQocmVhZGVyLCBvcHRpb25zLCBmaWVsZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKGtleSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGtleSA9IHNjYWxhclplcm9WYWx1ZShmaWVsZC5tYXBLZXksIGZhbHNlKTtcbiAgICB9XG4gICAgaWYgKHZhbCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHN3aXRjaCAoZmllbGQubWFwS2luZCkge1xuICAgICAgICAgICAgY2FzZSBcInNjYWxhclwiOlxuICAgICAgICAgICAgICAgIHZhbCA9IHNjYWxhclplcm9WYWx1ZShmaWVsZC5zY2FsYXIsIGZhbHNlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJlbnVtXCI6XG4gICAgICAgICAgICAgICAgdmFsID0gZmllbGQuZW51bS52YWx1ZXNbMF0ubnVtYmVyO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcIm1lc3NhZ2VcIjpcbiAgICAgICAgICAgICAgICB2YWwgPSByZWZsZWN0KGZpZWxkLm1lc3NhZ2UsIHVuZGVmaW5lZCwgZmFsc2UpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuICAgIG1hcC5zZXQoa2V5LCB2YWwpO1xufVxuZnVuY3Rpb24gcmVhZExpc3RGaWVsZChyZWFkZXIsIHdpcmVUeXBlLCBsaXN0LCBvcHRpb25zKSB7XG4gICAgdmFyIF9hO1xuICAgIGNvbnN0IGZpZWxkID0gbGlzdC5maWVsZCgpO1xuICAgIGlmIChmaWVsZC5saXN0S2luZCA9PT0gXCJtZXNzYWdlXCIpIHtcbiAgICAgICAgbGlzdC5hZGQocmVhZE1lc3NhZ2VGaWVsZChyZWFkZXIsIG9wdGlvbnMsIGZpZWxkKSk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3Qgc2NhbGFyVHlwZSA9IChfYSA9IGZpZWxkLnNjYWxhcikgIT09IG51bGwgJiYgX2EgIT09IHZvaWQgMCA/IF9hIDogU2NhbGFyVHlwZS5JTlQzMjtcbiAgICBjb25zdCBwYWNrZWQgPSB3aXJlVHlwZSA9PSBXaXJlVHlwZS5MZW5ndGhEZWxpbWl0ZWQgJiZcbiAgICAgICAgc2NhbGFyVHlwZSAhPSBTY2FsYXJUeXBlLlNUUklORyAmJlxuICAgICAgICBzY2FsYXJUeXBlICE9IFNjYWxhclR5cGUuQllURVM7XG4gICAgaWYgKCFwYWNrZWQpIHtcbiAgICAgICAgbGlzdC5hZGQocmVhZFNjYWxhcihyZWFkZXIsIHNjYWxhclR5cGUpKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBlID0gcmVhZGVyLnVpbnQzMigpICsgcmVhZGVyLnBvcztcbiAgICB3aGlsZSAocmVhZGVyLnBvcyA8IGUpIHtcbiAgICAgICAgbGlzdC5hZGQocmVhZFNjYWxhcihyZWFkZXIsIHNjYWxhclR5cGUpKTtcbiAgICB9XG59XG5mdW5jdGlvbiByZWFkTWVzc2FnZUZpZWxkKHJlYWRlciwgb3B0aW9ucywgZmllbGQsIG1lcmdlTWVzc2FnZSkge1xuICAgIGNvbnN0IGRlbGltaXRlZCA9IGZpZWxkLmRlbGltaXRlZEVuY29kaW5nO1xuICAgIGNvbnN0IG1lc3NhZ2UgPSBtZXJnZU1lc3NhZ2UgIT09IG51bGwgJiYgbWVyZ2VNZXNzYWdlICE9PSB2b2lkIDAgPyBtZXJnZU1lc3NhZ2UgOiByZWZsZWN0KGZpZWxkLm1lc3NhZ2UsIHVuZGVmaW5lZCwgZmFsc2UpO1xuICAgIHJlYWRNZXNzYWdlKG1lc3NhZ2UsIHJlYWRlciwgb3B0aW9ucywgZGVsaW1pdGVkLCBkZWxpbWl0ZWQgPyBmaWVsZC5udW1iZXIgOiByZWFkZXIudWludDMyKCkpO1xuICAgIHJldHVybiBtZXNzYWdlO1xufVxuZnVuY3Rpb24gcmVhZFNjYWxhcihyZWFkZXIsIHR5cGUpIHtcbiAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNUUklORzpcbiAgICAgICAgICAgIHJldHVybiByZWFkZXIuc3RyaW5nKCk7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5CT09MOlxuICAgICAgICAgICAgcmV0dXJuIHJlYWRlci5ib29sKCk7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5ET1VCTEU6XG4gICAgICAgICAgICByZXR1cm4gcmVhZGVyLmRvdWJsZSgpO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRkxPQVQ6XG4gICAgICAgICAgICByZXR1cm4gcmVhZGVyLmZsb2F0KCk7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5JTlQzMjpcbiAgICAgICAgICAgIHJldHVybiByZWFkZXIuaW50MzIoKTtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLklOVDY0OlxuICAgICAgICAgICAgcmV0dXJuIHJlYWRlci5pbnQ2NCgpO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuVUlOVDY0OlxuICAgICAgICAgICAgcmV0dXJuIHJlYWRlci51aW50NjQoKTtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZJWEVENjQ6XG4gICAgICAgICAgICByZXR1cm4gcmVhZGVyLmZpeGVkNjQoKTtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkJZVEVTOlxuICAgICAgICAgICAgcmV0dXJuIHJlYWRlci5ieXRlcygpO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRklYRUQzMjpcbiAgICAgICAgICAgIHJldHVybiByZWFkZXIuZml4ZWQzMigpO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0ZJWEVEMzI6XG4gICAgICAgICAgICByZXR1cm4gcmVhZGVyLnNmaXhlZDMyKCk7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TRklYRUQ2NDpcbiAgICAgICAgICAgIHJldHVybiByZWFkZXIuc2ZpeGVkNjQoKTtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNJTlQ2NDpcbiAgICAgICAgICAgIHJldHVybiByZWFkZXIuc2ludDY0KCk7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5VSU5UMzI6XG4gICAgICAgICAgICByZXR1cm4gcmVhZGVyLnVpbnQzMigpO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0lOVDMyOlxuICAgICAgICAgICAgcmV0dXJuIHJlYWRlci5zaW50MzIoKTtcbiAgICB9XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbmltcG9ydCB7IGJhc2U2NERlY29kZSB9IGZyb20gXCIuLi93aXJlL2Jhc2U2NC1lbmNvZGluZy5qc1wiO1xuaW1wb3J0IHsgRmlsZURlc2NyaXB0b3JQcm90b1NjaGVtYSB9IGZyb20gXCIuLi93a3QvZ2VuL2dvb2dsZS9wcm90b2J1Zi9kZXNjcmlwdG9yX3BiLmpzXCI7XG5pbXBvcnQgeyBjcmVhdGVGaWxlUmVnaXN0cnkgfSBmcm9tIFwiLi4vcmVnaXN0cnkuanNcIjtcbmltcG9ydCB7IHJlc3RvcmVKc29uTmFtZXMgfSBmcm9tIFwiLi9yZXN0b3JlLWpzb24tbmFtZXMuanNcIjtcbmltcG9ydCB7IGZyb21CaW5hcnkgfSBmcm9tIFwiLi4vZnJvbS1iaW5hcnkuanNcIjtcbi8qKlxuICogSHlkcmF0ZSBhIGZpbGUgZGVzY3JpcHRvci5cbiAqXG4gKiBAcHJpdmF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gZmlsZURlc2MoYjY0LCBpbXBvcnRzKSB7XG4gICAgdmFyIF9hO1xuICAgIGNvbnN0IHJvb3QgPSBmcm9tQmluYXJ5KEZpbGVEZXNjcmlwdG9yUHJvdG9TY2hlbWEsIGJhc2U2NERlY29kZShiNjQpKTtcbiAgICByb290Lm1lc3NhZ2VUeXBlLmZvckVhY2gocmVzdG9yZUpzb25OYW1lcyk7XG4gICAgcm9vdC5kZXBlbmRlbmN5ID0gKF9hID0gaW1wb3J0cyA9PT0gbnVsbCB8fCBpbXBvcnRzID09PSB2b2lkIDAgPyB2b2lkIDAgOiBpbXBvcnRzLm1hcCgoZikgPT4gZi5wcm90by5uYW1lKSkgIT09IG51bGwgJiYgX2EgIT09IHZvaWQgMCA/IF9hIDogW107XG4gICAgY29uc3QgcmVnID0gY3JlYXRlRmlsZVJlZ2lzdHJ5KHJvb3QsIChwcm90b0ZpbGVOYW1lKSA9PiBpbXBvcnRzID09PSBudWxsIHx8IGltcG9ydHMgPT09IHZvaWQgMCA/IHZvaWQgMCA6IGltcG9ydHMuZmluZCgoZikgPT4gZi5wcm90by5uYW1lID09PSBwcm90b0ZpbGVOYW1lKSk7XG4gICAgLy8gYmlvbWUtaWdub3JlIGxpbnQvc3R5bGUvbm9Ob25OdWxsQXNzZXJ0aW9uOiBub24tbnVsbCBhc3NlcnRpb24gYmVjYXVzZSB3ZSBqdXN0IGNyZWF0ZWQgdGhlIHJlZ2lzdHJ5IGZyb20gdGhlIGZpbGUgd2UgbG9vayB1cFxuICAgIHJldHVybiByZWcuZ2V0RmlsZShyb290Lm5hbWUpO1xufVxuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4vKipcbiAqIEh5ZHJhdGUgYSBzZXJ2aWNlIGRlc2NyaXB0b3IuXG4gKlxuICogQHByaXZhdGVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNlcnZpY2VEZXNjKGZpbGUsIHBhdGgsIC4uLnBhdGhzKSB7XG4gICAgaWYgKHBhdGhzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCk7XG4gICAgfVxuICAgIHJldHVybiBmaWxlLnNlcnZpY2VzW3BhdGhdO1xufVxuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4vKipcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydCBjb25zdCBwYWNrYWdlTmFtZSA9IFwiQGJ1ZmJ1aWxkL3Byb3RvYnVmXCI7XG4vKipcbiAqIEBwcml2YXRlXG4gKi9cbmV4cG9ydCBjb25zdCB3a3RQdWJsaWNJbXBvcnRQYXRocyA9IHtcbiAgICBcImdvb2dsZS9wcm90b2J1Zi9jb21waWxlci9wbHVnaW4ucHJvdG9cIjogcGFja2FnZU5hbWUgKyBcIi93a3RcIixcbiAgICBcImdvb2dsZS9wcm90b2J1Zi9hbnkucHJvdG9cIjogcGFja2FnZU5hbWUgKyBcIi93a3RcIixcbiAgICBcImdvb2dsZS9wcm90b2J1Zi9hcGkucHJvdG9cIjogcGFja2FnZU5hbWUgKyBcIi93a3RcIixcbiAgICBcImdvb2dsZS9wcm90b2J1Zi9jcHBfZmVhdHVyZXMucHJvdG9cIjogcGFja2FnZU5hbWUgKyBcIi93a3RcIixcbiAgICBcImdvb2dsZS9wcm90b2J1Zi9kZXNjcmlwdG9yLnByb3RvXCI6IHBhY2thZ2VOYW1lICsgXCIvd2t0XCIsXG4gICAgXCJnb29nbGUvcHJvdG9idWYvZHVyYXRpb24ucHJvdG9cIjogcGFja2FnZU5hbWUgKyBcIi93a3RcIixcbiAgICBcImdvb2dsZS9wcm90b2J1Zi9lbXB0eS5wcm90b1wiOiBwYWNrYWdlTmFtZSArIFwiL3drdFwiLFxuICAgIFwiZ29vZ2xlL3Byb3RvYnVmL2ZpZWxkX21hc2sucHJvdG9cIjogcGFja2FnZU5hbWUgKyBcIi93a3RcIixcbiAgICBcImdvb2dsZS9wcm90b2J1Zi9nb19mZWF0dXJlcy5wcm90b1wiOiBwYWNrYWdlTmFtZSArIFwiL3drdFwiLFxuICAgIFwiZ29vZ2xlL3Byb3RvYnVmL2phdmFfZmVhdHVyZXMucHJvdG9cIjogcGFja2FnZU5hbWUgKyBcIi93a3RcIixcbiAgICBcImdvb2dsZS9wcm90b2J1Zi9zb3VyY2VfY29udGV4dC5wcm90b1wiOiBwYWNrYWdlTmFtZSArIFwiL3drdFwiLFxuICAgIFwiZ29vZ2xlL3Byb3RvYnVmL3N0cnVjdC5wcm90b1wiOiBwYWNrYWdlTmFtZSArIFwiL3drdFwiLFxuICAgIFwiZ29vZ2xlL3Byb3RvYnVmL3RpbWVzdGFtcC5wcm90b1wiOiBwYWNrYWdlTmFtZSArIFwiL3drdFwiLFxuICAgIFwiZ29vZ2xlL3Byb3RvYnVmL3R5cGUucHJvdG9cIjogcGFja2FnZU5hbWUgKyBcIi93a3RcIixcbiAgICBcImdvb2dsZS9wcm90b2J1Zi93cmFwcGVycy5wcm90b1wiOiBwYWNrYWdlTmFtZSArIFwiL3drdFwiLFxufTtcbi8qKlxuICogQHByaXZhdGVcbiAqL1xuLy8gYmlvbWUtaWdub3JlIGZvcm1hdDogd2FudCB0aGlzIHRvIHJlYWQgd2VsbFxuZXhwb3J0IGNvbnN0IHN5bWJvbHMgPSB7XG4gICAgaXNNZXNzYWdlOiB7IHR5cGVPbmx5OiBmYWxzZSwgYm9vdHN0cmFwV2t0RnJvbTogXCIuLi8uLi9pcy1tZXNzYWdlLmpzXCIsIGZyb206IHBhY2thZ2VOYW1lIH0sXG4gICAgTWVzc2FnZTogeyB0eXBlT25seTogdHJ1ZSwgYm9vdHN0cmFwV2t0RnJvbTogXCIuLi8uLi90eXBlcy5qc1wiLCBmcm9tOiBwYWNrYWdlTmFtZSB9LFxuICAgIGNyZWF0ZTogeyB0eXBlT25seTogZmFsc2UsIGJvb3RzdHJhcFdrdEZyb206IFwiLi4vLi4vY3JlYXRlLmpzXCIsIGZyb206IHBhY2thZ2VOYW1lIH0sXG4gICAgZnJvbUpzb246IHsgdHlwZU9ubHk6IGZhbHNlLCBib290c3RyYXBXa3RGcm9tOiBcIi4uLy4uL2Zyb20tanNvbi5qc1wiLCBmcm9tOiBwYWNrYWdlTmFtZSB9LFxuICAgIGZyb21Kc29uU3RyaW5nOiB7IHR5cGVPbmx5OiBmYWxzZSwgYm9vdHN0cmFwV2t0RnJvbTogXCIuLi8uLi9mcm9tLWpzb24uanNcIiwgZnJvbTogcGFja2FnZU5hbWUgfSxcbiAgICBmcm9tQmluYXJ5OiB7IHR5cGVPbmx5OiBmYWxzZSwgYm9vdHN0cmFwV2t0RnJvbTogXCIuLi8uLi9mcm9tLWJpbmFyeS5qc1wiLCBmcm9tOiBwYWNrYWdlTmFtZSB9LFxuICAgIHRvQmluYXJ5OiB7IHR5cGVPbmx5OiBmYWxzZSwgYm9vdHN0cmFwV2t0RnJvbTogXCIuLi8uLi90by1iaW5hcnkuanNcIiwgZnJvbTogcGFja2FnZU5hbWUgfSxcbiAgICB0b0pzb246IHsgdHlwZU9ubHk6IGZhbHNlLCBib290c3RyYXBXa3RGcm9tOiBcIi4uLy4uL3RvLWpzb24uanNcIiwgZnJvbTogcGFja2FnZU5hbWUgfSxcbiAgICB0b0pzb25TdHJpbmc6IHsgdHlwZU9ubHk6IGZhbHNlLCBib290c3RyYXBXa3RGcm9tOiBcIi4uLy4uL3RvLWpzb24uanNcIiwgZnJvbTogcGFja2FnZU5hbWUgfSxcbiAgICBwcm90b0ludDY0OiB7IHR5cGVPbmx5OiBmYWxzZSwgYm9vdHN0cmFwV2t0RnJvbTogXCIuLi8uLi9wcm90by1pbnQ2NC5qc1wiLCBmcm9tOiBwYWNrYWdlTmFtZSB9LFxuICAgIEpzb25WYWx1ZTogeyB0eXBlT25seTogdHJ1ZSwgYm9vdHN0cmFwV2t0RnJvbTogXCIuLi8uLi9qc29uLXZhbHVlLmpzXCIsIGZyb206IHBhY2thZ2VOYW1lIH0sXG4gICAgSnNvbk9iamVjdDogeyB0eXBlT25seTogdHJ1ZSwgYm9vdHN0cmFwV2t0RnJvbTogXCIuLi8uLi9qc29uLXZhbHVlLmpzXCIsIGZyb206IHBhY2thZ2VOYW1lIH0sXG4gICAgY29kZWdlbjoge1xuICAgICAgICBib290OiB7IHR5cGVPbmx5OiBmYWxzZSwgYm9vdHN0cmFwV2t0RnJvbTogXCIuLi8uLi9jb2RlZ2VudjIvYm9vdC5qc1wiLCBmcm9tOiBwYWNrYWdlTmFtZSArIFwiL2NvZGVnZW52MlwiIH0sXG4gICAgICAgIGZpbGVEZXNjOiB7IHR5cGVPbmx5OiBmYWxzZSwgYm9vdHN0cmFwV2t0RnJvbTogXCIuLi8uLi9jb2RlZ2VudjIvZmlsZS5qc1wiLCBmcm9tOiBwYWNrYWdlTmFtZSArIFwiL2NvZGVnZW52MlwiIH0sXG4gICAgICAgIGVudW1EZXNjOiB7IHR5cGVPbmx5OiBmYWxzZSwgYm9vdHN0cmFwV2t0RnJvbTogXCIuLi8uLi9jb2RlZ2VudjIvZW51bS5qc1wiLCBmcm9tOiBwYWNrYWdlTmFtZSArIFwiL2NvZGVnZW52MlwiIH0sXG4gICAgICAgIGV4dERlc2M6IHsgdHlwZU9ubHk6IGZhbHNlLCBib290c3RyYXBXa3RGcm9tOiBcIi4uLy4uL2NvZGVnZW52Mi9leHRlbnNpb24uanNcIiwgZnJvbTogcGFja2FnZU5hbWUgKyBcIi9jb2RlZ2VudjJcIiB9LFxuICAgICAgICBtZXNzYWdlRGVzYzogeyB0eXBlT25seTogZmFsc2UsIGJvb3RzdHJhcFdrdEZyb206IFwiLi4vLi4vY29kZWdlbnYyL21lc3NhZ2UuanNcIiwgZnJvbTogcGFja2FnZU5hbWUgKyBcIi9jb2RlZ2VudjJcIiB9LFxuICAgICAgICBzZXJ2aWNlRGVzYzogeyB0eXBlT25seTogZmFsc2UsIGJvb3RzdHJhcFdrdEZyb206IFwiLi4vLi4vY29kZWdlbnYyL3NlcnZpY2UuanNcIiwgZnJvbTogcGFja2FnZU5hbWUgKyBcIi9jb2RlZ2VudjJcIiB9LFxuICAgICAgICB0c0VudW06IHsgdHlwZU9ubHk6IGZhbHNlLCBib290c3RyYXBXa3RGcm9tOiBcIi4uLy4uL2NvZGVnZW52Mi9lbnVtLmpzXCIsIGZyb206IHBhY2thZ2VOYW1lICsgXCIvY29kZWdlbnYyXCIgfSxcbiAgICAgICAgR2VuRmlsZTogeyB0eXBlT25seTogdHJ1ZSwgYm9vdHN0cmFwV2t0RnJvbTogXCIuLi8uLi9jb2RlZ2VudjIvdHlwZXMuanNcIiwgZnJvbTogcGFja2FnZU5hbWUgKyBcIi9jb2RlZ2VudjJcIiB9LFxuICAgICAgICBHZW5FbnVtOiB7IHR5cGVPbmx5OiB0cnVlLCBib290c3RyYXBXa3RGcm9tOiBcIi4uLy4uL2NvZGVnZW52Mi90eXBlcy5qc1wiLCBmcm9tOiBwYWNrYWdlTmFtZSArIFwiL2NvZGVnZW52MlwiIH0sXG4gICAgICAgIEdlbkV4dGVuc2lvbjogeyB0eXBlT25seTogdHJ1ZSwgYm9vdHN0cmFwV2t0RnJvbTogXCIuLi8uLi9jb2RlZ2VudjIvdHlwZXMuanNcIiwgZnJvbTogcGFja2FnZU5hbWUgKyBcIi9jb2RlZ2VudjJcIiB9LFxuICAgICAgICBHZW5NZXNzYWdlOiB7IHR5cGVPbmx5OiB0cnVlLCBib290c3RyYXBXa3RGcm9tOiBcIi4uLy4uL2NvZGVnZW52Mi90eXBlcy5qc1wiLCBmcm9tOiBwYWNrYWdlTmFtZSArIFwiL2NvZGVnZW52MlwiIH0sXG4gICAgICAgIEdlblNlcnZpY2U6IHsgdHlwZU9ubHk6IHRydWUsIGJvb3RzdHJhcFdrdEZyb206IFwiLi4vLi4vY29kZWdlbnYyL3R5cGVzLmpzXCIsIGZyb206IHBhY2thZ2VOYW1lICsgXCIvY29kZWdlbnYyXCIgfSxcbiAgICB9LFxufTtcbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuaW1wb3J0IHsgU2NhbGFyVHlwZSB9IGZyb20gXCIuLi9kZXNjcmlwdG9ycy5qc1wiO1xuLyoqXG4gKiBSZXR1cm4gdGhlIFR5cGVTY3JpcHQgdHlwZSAoYXMgYSBzdHJpbmcpIGZvciB0aGUgZ2l2ZW4gc2NhbGFyIHR5cGUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzY2FsYXJUeXBlU2NyaXB0VHlwZShzY2FsYXIsIGxvbmdBc1N0cmluZykge1xuICAgIHN3aXRjaCAoc2NhbGFyKSB7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TVFJJTkc6XG4gICAgICAgICAgICByZXR1cm4gXCJzdHJpbmdcIjtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkJPT0w6XG4gICAgICAgICAgICByZXR1cm4gXCJib29sZWFuXCI7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5VSU5UNjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TRklYRUQ2NDpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZJWEVENjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TSU5UNjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5JTlQ2NDpcbiAgICAgICAgICAgIHJldHVybiBsb25nQXNTdHJpbmcgPyBcInN0cmluZ1wiIDogXCJiaWdpbnRcIjtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkJZVEVTOlxuICAgICAgICAgICAgcmV0dXJuIFwiVWludDhBcnJheVwiO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgcmV0dXJuIFwibnVtYmVyXCI7XG4gICAgfVxufVxuLyoqXG4gKiBSZXR1cm4gdGhlIEpTT04gdHlwZSAoYXMgYSBzdHJpbmcpIGZvciB0aGUgZ2l2ZW4gc2NhbGFyIHR5cGUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzY2FsYXJKc29uVHlwZShzY2FsYXIpIHtcbiAgICBzd2l0Y2ggKHNjYWxhcikge1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRE9VQkxFOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRkxPQVQ6XG4gICAgICAgICAgICByZXR1cm4gYG51bWJlciB8IFwiTmFOXCIgfCBcIkluZmluaXR5XCIgfCBcIi1JbmZpbml0eVwiYDtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlVJTlQ2NDpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNGSVhFRDY0OlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRklYRUQ2NDpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNJTlQ2NDpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLklOVDY0OlxuICAgICAgICAgICAgcmV0dXJuIFwic3RyaW5nXCI7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5JTlQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZJWEVEMzI6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5VSU5UMzI6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TRklYRUQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNJTlQzMjpcbiAgICAgICAgICAgIHJldHVybiBcIm51bWJlclwiO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU1RSSU5HOlxuICAgICAgICAgICAgcmV0dXJuIFwic3RyaW5nXCI7XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5CT09MOlxuICAgICAgICAgICAgcmV0dXJuIFwiYm9vbGVhblwiO1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuQllURVM6XG4gICAgICAgICAgICByZXR1cm4gXCJzdHJpbmdcIjtcbiAgICB9XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbmNsYXNzIGJyYW5kdjIge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLnYgPSBcImNvZGVnZW52MlwiO1xuICAgICAgICB0aGlzLmEgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5iID0gZmFsc2U7XG4gICAgfVxufVxuZXhwb3J0IHt9O1xuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5leHBvcnQgKiBmcm9tIFwiLi9ib290LmpzXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9lbWJlZC5qc1wiO1xuZXhwb3J0ICogZnJvbSBcIi4vZW51bS5qc1wiO1xuZXhwb3J0ICogZnJvbSBcIi4vZXh0ZW5zaW9uLmpzXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9maWxlLmpzXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9tZXNzYWdlLmpzXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9zZXJ2aWNlLmpzXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9zeW1ib2xzLmpzXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9zY2FsYXIuanNcIjtcbmV4cG9ydCAqIGZyb20gXCIuL3R5cGVzLmpzXCI7XG4iLCAiLy8gQGdlbmVyYXRlZCBieSBwcm90b2MtZ2VuLWVzIHYyLjkuMCB3aXRoIHBhcmFtZXRlciBcInRhcmdldD10c1wiXG4vLyBAZ2VuZXJhdGVkIGZyb20gZmlsZSBwcm90by93c19tZXNzYWdlcy5wcm90byAocGFja2FnZSBsaWdodHNwZWVkZHVlbC53cywgc3ludGF4IHByb3RvMylcbi8qIGVzbGludC1kaXNhYmxlICovXG5cbmltcG9ydCB0eXBlIHsgR2VuRW51bSwgR2VuRmlsZSwgR2VuTWVzc2FnZSB9IGZyb20gXCJAYnVmYnVpbGQvcHJvdG9idWYvY29kZWdlbnYyXCI7XG5pbXBvcnQgeyBlbnVtRGVzYywgZmlsZURlc2MsIG1lc3NhZ2VEZXNjIH0gZnJvbSBcIkBidWZidWlsZC9wcm90b2J1Zi9jb2RlZ2VudjJcIjtcbmltcG9ydCB0eXBlIHsgTWVzc2FnZSB9IGZyb20gXCJAYnVmYnVpbGQvcHJvdG9idWZcIjtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIGZpbGUgcHJvdG8vd3NfbWVzc2FnZXMucHJvdG8uXG4gKi9cbmV4cG9ydCBjb25zdCBmaWxlX3Byb3RvX3dzX21lc3NhZ2VzOiBHZW5GaWxlID0gLypAX19QVVJFX18qL1xuICBmaWxlRGVzYyhcIkNoZHdjbTkwYnk5M2MxOXRaWE56WVdkbGN5NXdjbTkwYnhJUmJHbG5hSFJ6Y0dWbFpHUjFaV3d1ZDNNaXdBMEtDbGR6Ulc1MlpXeHZjR1VTTmdvTWMzUmhkR1ZmZFhCa1lYUmxHQUVnQVNnTE1oNHViR2xuYUhSemNHVmxaR1IxWld3dWQzTXVVM1JoZEdWVmNHUmhkR1ZJQUJJMUNnbHliMjl0WDJaMWJHd1lBaUFCS0FzeUlDNXNhV2RvZEhOd1pXVmtaSFZsYkM1M2N5NVNiMjl0Um5Wc2JFVnljbTl5U0FBU0xRb0VhbTlwYmhnS0lBRW9DeklkTG14cFoyaDBjM0JsWldSa2RXVnNMbmR6TGtOc2FXVnVkRXB2YVc1SUFCSXdDZ2x6Y0dGM2JsOWliM1FZQ3lBQktBc3lHeTVzYVdkb2RITndaV1ZrWkhWbGJDNTNjeTVUY0dGM2JrSnZkRWdBRWpZS0RHRmtaRjkzWVhsd2IybHVkQmdNSUFFb0N6SWVMbXhwWjJoMGMzQmxaV1JrZFdWc0xuZHpMa0ZrWkZkaGVYQnZhVzUwU0FBU1BBb1BkWEJrWVhSbFgzZGhlWEJ2YVc1MEdBMGdBU2dMTWlFdWJHbG5hSFJ6Y0dWbFpHUjFaV3d1ZDNNdVZYQmtZWFJsVjJGNWNHOXBiblJJQUJJNENnMXRiM1psWDNkaGVYQnZhVzUwR0E0Z0FTZ0xNaDh1YkdsbmFIUnpjR1ZsWkdSMVpXd3VkM011VFc5MlpWZGhlWEJ2YVc1MFNBQVNQQW9QWkdWc1pYUmxYM2RoZVhCdmFXNTBHQThnQVNnTE1pRXViR2xuYUhSemNHVmxaR1IxWld3dWQzTXVSR1ZzWlhSbFYyRjVjRzlwYm5SSUFCSThDZzlqYkdWaGNsOTNZWGx3YjJsdWRITVlFQ0FCS0FzeUlTNXNhV2RvZEhOd1pXVmtaSFZsYkM1M2N5NURiR1ZoY2xkaGVYQnZhVzUwYzBnQUVrQUtFV052Ym1acFozVnlaVjl0YVhOemFXeGxHQkVnQVNnTE1pTXViR2xuYUhSemNHVmxaR1IxWld3dWQzTXVRMjl1Wm1sbmRYSmxUV2x6YzJsc1pVZ0FFa1VLRkdGa1pGOXRhWE56YVd4bFgzZGhlWEJ2YVc1MEdCSWdBU2dMTWlVdWJHbG5hSFJ6Y0dWbFpHUjFaV3d1ZDNNdVFXUmtUV2x6YzJsc1pWZGhlWEJ2YVc1MFNBQVNWZ29kZFhCa1lYUmxYMjFwYzNOcGJHVmZkMkY1Y0c5cGJuUmZjM0JsWldRWUV5QUJLQXN5TFM1c2FXZG9kSE53WldWa1pIVmxiQzUzY3k1VmNHUmhkR1ZOYVhOemFXeGxWMkY1Y0c5cGJuUlRjR1ZsWkVnQUVrY0tGVzF2ZG1WZmJXbHpjMmxzWlY5M1lYbHdiMmx1ZEJnVUlBRW9DekltTG14cFoyaDBjM0JsWldSa2RXVnNMbmR6TGsxdmRtVk5hWE56YVd4bFYyRjVjRzlwYm5SSUFCSkxDaGRrWld4bGRHVmZiV2x6YzJsc1pWOTNZWGx3YjJsdWRCZ1ZJQUVvQ3pJb0xteHBaMmgwYzNCbFpXUmtkV1ZzTG5kekxrUmxiR1YwWlUxcGMzTnBiR1ZYWVhsd2IybHVkRWdBRWtNS0UyTnNaV0Z5WDIxcGMzTnBiR1ZmY205MWRHVVlGaUFCS0FzeUpDNXNhV2RvZEhOd1pXVmtaSFZsYkM1M2N5NURiR1ZoY2sxcGMzTnBiR1ZTYjNWMFpVZ0FFajhLRVdGa1pGOXRhWE56YVd4bFgzSnZkWFJsR0JjZ0FTZ0xNaUl1YkdsbmFIUnpjR1ZsWkdSMVpXd3VkM011UVdSa1RXbHpjMmxzWlZKdmRYUmxTQUFTUlFvVWNtVnVZVzFsWDIxcGMzTnBiR1ZmY205MWRHVVlHQ0FCS0FzeUpTNXNhV2RvZEhOd1pXVmtaSFZsYkM1M2N5NVNaVzVoYldWTmFYTnphV3hsVW05MWRHVklBQkpGQ2hSa1pXeGxkR1ZmYldsemMybHNaVjl5YjNWMFpSZ1pJQUVvQ3pJbExteHBaMmgwYzNCbFpXUmtkV1ZzTG5kekxrUmxiR1YwWlUxcGMzTnBiR1ZTYjNWMFpVZ0FFa3dLR0hObGRGOWhZM1JwZG1WZmJXbHpjMmxzWlY5eWIzVjBaUmdhSUFFb0N6SW9MbXhwWjJoMGMzQmxaV1JrZFdWc0xuZHpMbE5sZEVGamRHbDJaVTFwYzNOcGJHVlNiM1YwWlVnQUVqb0tEbXhoZFc1amFGOXRhWE56YVd4bEdCc2dBU2dMTWlBdWJHbG5hSFJ6Y0dWbFpHUjFaV3d1ZDNNdVRHRjFibU5vVFdsemMybHNaVWdBRWpBS0NXUmhaMTl6ZEdGeWRCZ2VJQUVvQ3pJYkxteHBaMmgwYzNCbFpXUmtkV1ZzTG5kekxrUmhaMU4wWVhKMFNBQVNNZ29LWkdGblgyTmhibU5sYkJnZklBRW9DekljTG14cFoyaDBjM0JsWldSa2RXVnNMbmR6TGtSaFowTmhibU5sYkVnQUVqY0tEV1JoWjE5emRHOXllVjloWTJzWUlDQUJLQXN5SGk1c2FXZG9kSE53WldWa1pIVmxiQzUzY3k1RVlXZFRkRzl5ZVVGamEwZ0FFaTRLQ0dSaFoxOXNhWE4wR0NFZ0FTZ0xNaG91YkdsbmFIUnpjR1ZsWkdSMVpXd3VkM011UkdGblRHbHpkRWdBRWtFS0VtMXBjM05wYjI1ZmMzQmhkMjVmZDJGMlpSZ29JQUVvQ3pJakxteHBaMmgwYzNCbFpXUmtkV1ZzTG5kekxrMXBjM05wYjI1VGNHRjNibGRoZG1WSUFCSkRDaE50YVhOemFXOXVYM04wYjNKNVgyVjJaVzUwR0NrZ0FTZ0xNaVF1YkdsbmFIUnpjR1ZsWkdSMVpXd3VkM011VFdsemMybHZibE4wYjNKNVJYWmxiblJJQUJJL0NoRmtZV2RmYkdsemRGOXlaWE53YjI1elpSZ3lJQUVvQ3pJaUxteHBaMmgwYzNCbFpXUmtkV1ZzTG5kekxrUmhaMHhwYzNSU1pYTndiMjV6WlVnQVFna0tCM0JoZVd4dllXUWlzd1VLQzFOMFlYUmxWWEJrWVhSbEVnc0tBMjV2ZHhnQklBRW9BUklrQ2dKdFpSZ0NJQUVvQ3pJWUxteHBaMmgwYzNCbFpXUmtkV1ZzTG5kekxrZG9iM04wRWlnS0JtZG9iM04wY3hnRElBTW9DeklZTG14cFoyaDBjM0JsWldSa2RXVnNMbmR6TGtkb2IzTjBFaWtLQkcxbGRHRVlCQ0FCS0FzeUd5NXNhV2RvZEhOd1pXVmtaSFZsYkM1M2N5NVNiMjl0VFdWMFlSSXNDZ2h0YVhOemFXeGxjeGdGSUFNb0N6SWFMbXhwWjJoMGMzQmxaV1JrZFdWc0xuZHpMazFwYzNOcGJHVVNPQW9PYldsemMybHNaVjlqYjI1bWFXY1lCaUFCS0FzeUlDNXNhV2RvZEhOd1pXVmtaSFZsYkM1M2N5NU5hWE56YVd4bFEyOXVabWxuRWpZS0VXMXBjM05wYkdWZmQyRjVjRzlwYm5SekdBY2dBeWdMTWhzdWJHbG5hSFJ6Y0dWbFpHUjFaV3d1ZDNNdVYyRjVjRzlwYm5RU053b09iV2x6YzJsc1pWOXliM1YwWlhNWUNDQURLQXN5SHk1c2FXZG9kSE53WldWa1pIVmxiQzUzY3k1TmFYTnphV3hsVW05MWRHVVNIQW9VWVdOMGFYWmxYMjFwYzNOcGJHVmZjbTkxZEdVWUNTQUJLQWtTR2dvU2JtVjRkRjl0YVhOemFXeGxYM0psWVdSNUdBb2dBU2dCRWkwS0EyUmhaeGdMSUFFb0N6SWJMbXhwWjJoMGMzQmxaV1JrZFdWc0xuZHpMa1JoWjFOMFlYUmxTQUNJQVFFU05Bb0phVzUyWlc1MGIzSjVHQXdnQVNnTE1od3ViR2xuYUhSemNHVmxaR1IxWld3dWQzTXVTVzUyWlc1MGIzSjVTQUdJQVFFU01Rb0ZjM1J2Y25rWURTQUJLQXN5SFM1c2FXZG9kSE53WldWa1pIVmxiQzUzY3k1VGRHOXllVk4wWVhSbFNBS0lBUUVTUUFvTVkyRndZV0pwYkdsMGFXVnpHQTRnQVNnTE1pVXViR2xuYUhSemNHVmxaR1IxWld3dWQzTXVVR3hoZVdWeVEyRndZV0pwYkdsMGFXVnpTQU9JQVFGQ0Jnb0VYMlJoWjBJTUNncGZhVzUyWlc1MGIzSjVRZ2dLQmw5emRHOXllVUlQQ2cxZlkyRndZV0pwYkdsMGFXVnpJaUFLRFZKdmIyMUdkV3hzUlhKeWIzSVNEd29IYldWemMyRm5aUmdCSUFFb0NTSkdDZ3BEYkdsbGJuUktiMmx1RWd3S0JHNWhiV1VZQVNBQktBa1NEQW9FY205dmJSZ0NJQUVvQ1JJTkNnVnRZWEJmZHhnRElBRW9BUklOQ2dWdFlYQmZhQmdFSUFFb0FTSUtDZ2hUY0dGM2JrSnZkQ0l5Q2d0QlpHUlhZWGx3YjJsdWRCSUpDZ0Y0R0FFZ0FTZ0JFZ2tLQVhrWUFpQUJLQUVTRFFvRmMzQmxaV1FZQXlBQktBRWlMZ29PVlhCa1lYUmxWMkY1Y0c5cGJuUVNEUW9GYVc1a1pYZ1lBU0FCS0FVU0RRb0ZjM0JsWldRWUFpQUJLQUVpTXdvTVRXOTJaVmRoZVhCdmFXNTBFZzBLQldsdVpHVjRHQUVnQVNnRkVna0tBWGdZQWlBQktBRVNDUW9CZVJnRElBRW9BU0lmQ2c1RVpXeGxkR1ZYWVhsd2IybHVkQklOQ2dWcGJtUmxlQmdCSUFFb0JTSVFDZzVEYkdWaGNsZGhlWEJ2YVc1MGN5SS9DaEJEYjI1bWFXZDFjbVZOYVhOemFXeGxFaFVLRFcxcGMzTnBiR1ZmYzNCbFpXUVlBU0FCS0FFU0ZBb01iV2x6YzJsc1pWOWhaM0p2R0FJZ0FTZ0JJa3NLRWtGa1pFMXBjM05wYkdWWFlYbHdiMmx1ZEJJUUNnaHliM1YwWlY5cFpCZ0JJQUVvQ1JJSkNnRjRHQUlnQVNnQkVna0tBWGtZQXlBQktBRVNEUW9GYzNCbFpXUVlCQ0FCS0FFaVRBb2FWWEJrWVhSbFRXbHpjMmxzWlZkaGVYQnZhVzUwVTNCbFpXUVNFQW9JY205MWRHVmZhV1FZQVNBQktBa1NEUW9GYVc1a1pYZ1lBaUFCS0FVU0RRb0ZjM0JsWldRWUF5QUJLQUVpVEFvVFRXOTJaVTFwYzNOcGJHVlhZWGx3YjJsdWRCSVFDZ2h5YjNWMFpWOXBaQmdCSUFFb0NSSU5DZ1ZwYm1SbGVCZ0NJQUVvQlJJSkNnRjRHQU1nQVNnQkVna0tBWGtZQkNBQktBRWlPQW9WUkdWc1pYUmxUV2x6YzJsc1pWZGhlWEJ2YVc1MEVoQUtDSEp2ZFhSbFgybGtHQUVnQVNnSkVnMEtCV2x1WkdWNEdBSWdBU2dGSWlVS0VVTnNaV0Z5VFdsemMybHNaVkp2ZFhSbEVoQUtDSEp2ZFhSbFgybGtHQUVnQVNnSkloOEtEMEZrWkUxcGMzTnBiR1ZTYjNWMFpSSU1DZ1J1WVcxbEdBRWdBU2dKSWpRS0VsSmxibUZ0WlUxcGMzTnBiR1ZTYjNWMFpSSVFDZ2h5YjNWMFpWOXBaQmdCSUFFb0NSSU1DZ1J1WVcxbEdBSWdBU2dKSWlZS0VrUmxiR1YwWlUxcGMzTnBiR1ZTYjNWMFpSSVFDZ2h5YjNWMFpWOXBaQmdCSUFFb0NTSXBDaFZUWlhSQlkzUnBkbVZOYVhOemFXeGxVbTkxZEdVU0VBb0ljbTkxZEdWZmFXUVlBU0FCS0FraUlRb05UR0YxYm1Ob1RXbHpjMmxzWlJJUUNnaHliM1YwWlY5cFpCZ0JJQUVvQ1NLQ0Fnb0ZSMmh2YzNRU0Nnb0NhV1FZQVNBQktBa1NDUW9CZUJnQ0lBRW9BUklKQ2dGNUdBTWdBU2dCRWdvS0FuWjRHQVFnQVNnQkVnb0tBblo1R0FVZ0FTZ0JFZ2tLQVhRWUJpQUJLQUVTREFvRWMyVnNaaGdISUFFb0NCSXVDZ2wzWVhsd2IybHVkSE1ZQ0NBREtBc3lHeTVzYVdkb2RITndaV1ZrWkhWbGJDNTNjeTVYWVhsd2IybHVkQkllQ2haamRYSnlaVzUwWDNkaGVYQnZhVzUwWDJsdVpHVjRHQWtnQVNnRkVnb0tBbWh3R0FvZ0FTZ0ZFZzBLQld0cGJHeHpHQXNnQVNnRkVqSUtCR2hsWVhRWURDQUJLQXN5SHk1c2FXZG9kSE53WldWa1pIVmxiQzUzY3k1VGFHbHdTR1ZoZEZacFpYZElBSWdCQVVJSENnVmZhR1ZoZENJdkNnaFhZWGx3YjJsdWRCSUpDZ0Y0R0FFZ0FTZ0JFZ2tLQVhrWUFpQUJLQUVTRFFvRmMzQmxaV1FZQXlBQktBRWlLd29JVW05dmJVMWxkR0VTQ1FvQll4Z0JJQUVvQVJJSkNnRjNHQUlnQVNnQkVna0tBV2dZQXlBQktBRWlpd0lLQjAxcGMzTnBiR1VTQ2dvQ2FXUVlBU0FCS0FrU0RRb0ZiM2R1WlhJWUFpQUJLQWtTREFvRWMyVnNaaGdESUFFb0NCSUpDZ0Y0R0FRZ0FTZ0JFZ2tLQVhrWUJTQUJLQUVTQ2dvQ2RuZ1lCaUFCS0FFU0Nnb0NkbmtZQnlBQktBRVNDUW9CZEJnSUlBRW9BUklUQ2d0aFozSnZYM0poWkdsMWN4Z0pJQUVvQVJJUUNnaHNhV1psZEdsdFpSZ0tJQUVvQVJJVENndHNZWFZ1WTJoZmRHbHRaUmdMSUFFb0FSSVNDZ3BsZUhCcGNtVnpYMkYwR0F3Z0FTZ0JFaEVLQ1hSaGNtZGxkRjlwWkJnTklBRW9DUkl5Q2dSb1pXRjBHQTRnQVNnTE1oOHViR2xuYUhSemNHVmxaR1IxWld3dWQzTXVVMmhwY0VobFlYUldhV1YzU0FDSUFRRkNCd29GWDJobFlYUWl4Z0VLRFUxcGMzTnBiR1ZEYjI1bWFXY1NEUW9GYzNCbFpXUVlBU0FCS0FFU0VRb0pjM0JsWldSZmJXbHVHQUlnQVNnQkVoRUtDWE53WldWa1gyMWhlQmdESUFFb0FSSVFDZ2hoWjNKdlgyMXBiaGdFSUFFb0FSSVRDZ3RoWjNKdlgzSmhaR2wxY3hnRklBRW9BUklRQ2doc2FXWmxkR2x0WlJnR0lBRW9BUkkzQ2d0b1pXRjBYMk52Ym1acFp4Z0hJQUVvQ3pJZExteHBaMmgwYzNCbFpXUmtkV1ZzTG5kekxraGxZWFJRWVhKaGJYTklBSWdCQVVJT0NneGZhR1ZoZEY5amIyNW1hV2NpV0FvTVRXbHpjMmxzWlZKdmRYUmxFZ29LQW1sa0dBRWdBU2dKRWd3S0JHNWhiV1VZQWlBQktBa1NMZ29KZDJGNWNHOXBiblJ6R0FNZ0F5Z0xNaHN1YkdsbmFIUnpjR1ZsWkdSMVpXd3VkM011VjJGNWNHOXBiblFpZGdvTVUyaHBjRWhsWVhSV2FXVjNFZ2tLQVhZWUFTQUJLQUVTQ1FvQmJSZ0NJQUVvQVJJSkNnRjNHQU1nQVNnQkVna0tBVzhZQkNBQktBRVNDZ29DYlhNWUJTQUJLQUVTQ2dvQ2MzVVlCaUFCS0FFU0Nnb0NhM1VZQnlBQktBRVNDZ29DYTJRWUNDQUJLQUVTQ2dvQ1pYZ1lDU0FCS0FFaWdBRUtDa2hsWVhSUVlYSmhiWE1TQ3dvRGJXRjRHQUVnQVNnQkVnOEtCM2RoY201ZllYUVlBaUFCS0FFU0V3b0xiM1psY21obFlYUmZZWFFZQXlBQktBRVNGQW9NYldGeWEyVnlYM053WldWa0dBUWdBU2dCRWd3S0JHdGZkWEFZQlNBQktBRVNEZ29HYTE5a2IzZHVHQVlnQVNnQkVnc0tBMlY0Y0JnSElBRW9BU0ozQ2cxVmNHZHlZV1JsUldabVpXTjBFaklLQkhSNWNHVVlBU0FCS0E0eUpDNXNhV2RvZEhOd1pXVmtaSFZsYkM1M2N5NVZjR2R5WVdSbFJXWm1aV04wVkhsd1pSSVVDZ3B0ZFd4MGFYQnNhV1Z5R0FJZ0FTZ0JTQUFTRXdvSmRXNXNiMk5yWDJsa0dBTWdBU2dKU0FCQ0J3b0ZkbUZzZFdVaWVRb1NVR3hoZVdWeVEyRndZV0pwYkdsMGFXVnpFaGdLRUhOd1pXVmtYMjExYkhScGNHeHBaWElZQVNBQktBRVNHUW9SZFc1c2IyTnJaV1JmYldsemMybHNaWE1ZQWlBREtBa1NGUW9OYUdWaGRGOWpZWEJoWTJsMGVSZ0RJQUVvQVJJWENnOW9aV0YwWDJWbVptbGphV1Z1WTNrWUJDQUJLQUVpOUFFS0IwUmhaMDV2WkdVU0Nnb0NhV1FZQVNBQktBa1NMQW9FYTJsdVpCZ0NJQUVvRGpJZUxteHBaMmgwYzNCbFpXUmtkV1ZzTG5kekxrUmhaMDV2WkdWTGFXNWtFZzBLQld4aFltVnNHQU1nQVNnSkVqQUtCbk4wWVhSMWN4Z0VJQUVvRGpJZ0xteHBaMmgwYzNCbFpXUmtkV1ZzTG5kekxrUmhaMDV2WkdWVGRHRjBkWE1TRXdvTGNtVnRZV2x1YVc1blgzTVlCU0FCS0FFU0Vnb0taSFZ5WVhScGIyNWZjeGdHSUFFb0FSSVNDZ3B5WlhCbFlYUmhZbXhsR0FjZ0FTZ0lFakVLQjJWbVptVmpkSE1ZQ0NBREtBc3lJQzVzYVdkb2RITndaV1ZrWkhWbGJDNTNjeTVWY0dkeVlXUmxSV1ptWldOMElqVUtDRVJoWjFOMFlYUmxFaWtLQlc1dlpHVnpHQUVnQXlnTE1ob3ViR2xuYUhSemNHVmxaR1IxWld3dWQzTXVSR0ZuVG05a1pTSWJDZ2hFWVdkVGRHRnlkQklQQ2dkdWIyUmxYMmxrR0FFZ0FTZ0pJaHdLQ1VSaFowTmhibU5sYkJJUENnZHViMlJsWDJsa0dBRWdBU2dKSWpFS0MwUmhaMU4wYjNKNVFXTnJFZzhLQjI1dlpHVmZhV1FZQVNBQktBa1NFUW9KWTJodmFXTmxYMmxrR0FJZ0FTZ0pJZ2tLQjBSaFoweHBjM1FpT3dvUFJHRm5UR2x6ZEZKbGMzQnZibk5sRWlnS0EyUmhaeGdCSUFFb0N6SWJMbXhwWjJoMGMzQmxaV1JrZFdWc0xuZHpMa1JoWjFOMFlYUmxJbG9LRFVsdWRtVnVkRzl5ZVVsMFpXMFNEQW9FZEhsd1pSZ0JJQUVvQ1JJU0NncDJZWEpwWVc1MFgybGtHQUlnQVNnSkVoVUtEV2hsWVhSZlkyRndZV05wZEhrWUF5QUJLQUVTRUFvSWNYVmhiblJwZEhrWUJDQUJLQVVpUEFvSlNXNTJaVzUwYjNKNUVpOEtCV2wwWlcxekdBRWdBeWdMTWlBdWJHbG5hSFJ6Y0dWbFpHUjFaV3d1ZDNNdVNXNTJaVzUwYjNKNVNYUmxiU0l2Q2hOVGRHOXllVVJwWVd4dlozVmxRMmh2YVdObEVnb0tBbWxrR0FFZ0FTZ0pFZ3dLQkhSbGVIUVlBaUFCS0FraUx3b1FVM1J2Y25sVWRYUnZjbWxoYkZScGNCSU5DZ1YwYVhSc1pSZ0JJQUVvQ1JJTUNnUjBaWGgwR0FJZ0FTZ0pJb0FDQ2cxVGRHOXllVVJwWVd4dlozVmxFZzhLQjNOd1pXRnJaWElZQVNBQktBa1NEQW9FZEdWNGRCZ0NJQUVvQ1JJdUNnWnBiblJsYm5RWUF5QUJLQTR5SGk1c2FXZG9kSE53WldWa1pIVmxiQzUzY3k1VGRHOXllVWx1ZEdWdWRCSVdDZzVqYjI1MGFXNTFaVjlzWVdKbGJCZ0VJQUVvQ1JJM0NnZGphRzlwWTJWekdBVWdBeWdMTWlZdWJHbG5hSFJ6Y0dWbFpHUjFaV3d1ZDNNdVUzUnZjbmxFYVdGc2IyZDFaVU5vYjJsalpSSStDZ3gwZFhSdmNtbGhiRjkwYVhBWUJpQUJLQXN5SXk1c2FXZG9kSE53WldWa1pIVmxiQzUzY3k1VGRHOXllVlIxZEc5eWFXRnNWR2x3U0FDSUFRRkNEd29OWDNSMWRHOXlhV0ZzWDNScGNDSkVDZ3BUZEc5eWVVVjJaVzUwRWhJS0NtTm9ZWEIwWlhKZmFXUVlBU0FCS0FrU0R3b0hibTlrWlY5cFpCZ0NJQUVvQ1JJUkNnbDBhVzFsYzNSaGJYQVlBeUFCS0FFaWx3SUtDbE4wYjNKNVUzUmhkR1VTRXdvTFlXTjBhWFpsWDI1dlpHVVlBU0FCS0FrU053b0laR2xoYkc5bmRXVVlBaUFCS0FzeUlDNXNhV2RvZEhOd1pXVmtaSFZsYkM1M2N5NVRkRzl5ZVVScFlXeHZaM1ZsU0FDSUFRRVNFUW9KWVhaaGFXeGhZbXhsR0FNZ0F5Z0pFamNLQldac1lXZHpHQVFnQXlnTE1pZ3ViR2xuYUhSemNHVmxaR1IxWld3dWQzTXVVM1J2Y25sVGRHRjBaUzVHYkdGbmMwVnVkSEo1RWpRS0RYSmxZMlZ1ZEY5bGRtVnVkSE1ZQlNBREtBc3lIUzVzYVdkb2RITndaV1ZrWkhWbGJDNTNjeTVUZEc5eWVVVjJaVzUwR2l3S0NrWnNZV2R6Ulc1MGNua1NDd29EYTJWNUdBRWdBU2dKRWcwS0JYWmhiSFZsR0FJZ0FTZ0lPZ0k0QVVJTENnbGZaR2xoYkc5bmRXVWlKZ29RVFdsemMybHZibE53WVhkdVYyRjJaUklTQ2dwM1lYWmxYMmx1WkdWNEdBRWdBU2dGSWpJS0VVMXBjM05wYjI1VGRHOXllVVYyWlc1MEVnMEtCV1YyWlc1MEdBRWdBU2dKRWc0S0JtSmxZV052YmhnQ0lBRW9CU3FyQVFvTlJHRm5UbTlrWlZOMFlYUjFjeElmQ2h0RVFVZGZUazlFUlY5VFZFRlVWVk5mVlU1VFVFVkRTVVpKUlVRUUFCSWFDaFpFUVVkZlRrOUVSVjlUVkVGVVZWTmZURTlEUzBWRUVBRVNIUW9aUkVGSFgwNVBSRVZmVTFSQlZGVlRYMEZXUVVsTVFVSk1SUkFDRWg4S0cwUkJSMTlPVDBSRlgxTlVRVlJWVTE5SlRsOVFVazlIVWtWVFV4QURFaDBLR1VSQlIxOU9UMFJGWDFOVVFWUlZVMTlEVDAxUVRFVlVSVVFRQkNxUkFRb0xSR0ZuVG05a1pVdHBibVFTSFFvWlJFRkhYMDVQUkVWZlMwbE9SRjlWVGxOUVJVTkpSa2xGUkJBQUVoa0tGVVJCUjE5T1QwUkZYMHRKVGtSZlJrRkRWRTlTV1JBQkVoWUtFa1JCUjE5T1QwUkZYMHRKVGtSZlZVNUpWQkFDRWhjS0UwUkJSMTlPVDBSRlgwdEpUa1JmVTFSUFVsa1FBeElYQ2hORVFVZGZUazlFUlY5TFNVNUVYME5TUVVaVUVBUXEyZ0VLRVZWd1ozSmhaR1ZGWm1abFkzUlVlWEJsRWlNS0gxVlFSMUpCUkVWZlJVWkdSVU5VWDFSWlVFVmZWVTVUVUVWRFNVWkpSVVFRQUJJb0NpUlZVRWRTUVVSRlgwVkdSa1ZEVkY5VVdWQkZYMU5RUlVWRVgwMVZURlJKVUV4SlJWSVFBUkltQ2lKVlVFZFNRVVJGWDBWR1JrVkRWRjlVV1ZCRlgwMUpVMU5KVEVWZlZVNU1UME5MRUFJU0pRb2hWVkJIVWtGRVJWOUZSa1pGUTFSZlZGbFFSVjlJUlVGVVgwTkJVRUZEU1ZSWkVBTVNKd29qVlZCSFVrRkVSVjlGUmtaRlExUmZWRmxRUlY5SVJVRlVYMFZHUmtsRFNVVk9RMWtRQkNwY0NndFRkRzl5ZVVsdWRHVnVkQkljQ2hoVFZFOVNXVjlKVGxSRlRsUmZWVTVUVUVWRFNVWkpSVVFRQUJJWUNoUlRWRTlTV1Y5SlRsUkZUbFJmUmtGRFZFOVNXUkFCRWhVS0VWTlVUMUpaWDBsT1ZFVk9WRjlWVGtsVUVBSkNJbG9nVEdsbmFIUlRjR1ZsWkVSMVpXd3ZhVzUwWlhKdVlXd3ZjSEp2ZEc4dmQzTmlCbkJ5YjNSdk13XCIpO1xuXG4vKipcbiAqIFdzRW52ZWxvcGUgd3JhcHMgYWxsIFdlYlNvY2tldCBtZXNzYWdlcyBpbiBhIGRpc2NyaW1pbmF0ZWQgdW5pb25cbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5Xc0VudmVsb3BlXG4gKi9cbmV4cG9ydCB0eXBlIFdzRW52ZWxvcGUgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuV3NFbnZlbG9wZVwiPiAmIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBvbmVvZiBsaWdodHNwZWVkZHVlbC53cy5Xc0VudmVsb3BlLnBheWxvYWRcbiAgICovXG4gIHBheWxvYWQ6IHtcbiAgICAvKipcbiAgICAgKiBTZXJ2ZXIgXHUyMTkyIENsaWVudFxuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5TdGF0ZVVwZGF0ZSBzdGF0ZV91cGRhdGUgPSAxO1xuICAgICAqL1xuICAgIHZhbHVlOiBTdGF0ZVVwZGF0ZTtcbiAgICBjYXNlOiBcInN0YXRlVXBkYXRlXCI7XG4gIH0gfCB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5Sb29tRnVsbEVycm9yIHJvb21fZnVsbCA9IDI7XG4gICAgICovXG4gICAgdmFsdWU6IFJvb21GdWxsRXJyb3I7XG4gICAgY2FzZTogXCJyb29tRnVsbFwiO1xuICB9IHwge1xuICAgIC8qKlxuICAgICAqIENsaWVudCBcdTIxOTIgU2VydmVyXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLkNsaWVudEpvaW4gam9pbiA9IDEwO1xuICAgICAqL1xuICAgIHZhbHVlOiBDbGllbnRKb2luO1xuICAgIGNhc2U6IFwiam9pblwiO1xuICB9IHwge1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogbGlnaHRzcGVlZGR1ZWwud3MuU3Bhd25Cb3Qgc3Bhd25fYm90ID0gMTE7XG4gICAgICovXG4gICAgdmFsdWU6IFNwYXduQm90O1xuICAgIGNhc2U6IFwic3Bhd25Cb3RcIjtcbiAgfSB8IHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLkFkZFdheXBvaW50IGFkZF93YXlwb2ludCA9IDEyO1xuICAgICAqL1xuICAgIHZhbHVlOiBBZGRXYXlwb2ludDtcbiAgICBjYXNlOiBcImFkZFdheXBvaW50XCI7XG4gIH0gfCB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5VcGRhdGVXYXlwb2ludCB1cGRhdGVfd2F5cG9pbnQgPSAxMztcbiAgICAgKi9cbiAgICB2YWx1ZTogVXBkYXRlV2F5cG9pbnQ7XG4gICAgY2FzZTogXCJ1cGRhdGVXYXlwb2ludFwiO1xuICB9IHwge1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogbGlnaHRzcGVlZGR1ZWwud3MuTW92ZVdheXBvaW50IG1vdmVfd2F5cG9pbnQgPSAxNDtcbiAgICAgKi9cbiAgICB2YWx1ZTogTW92ZVdheXBvaW50O1xuICAgIGNhc2U6IFwibW92ZVdheXBvaW50XCI7XG4gIH0gfCB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5EZWxldGVXYXlwb2ludCBkZWxldGVfd2F5cG9pbnQgPSAxNTtcbiAgICAgKi9cbiAgICB2YWx1ZTogRGVsZXRlV2F5cG9pbnQ7XG4gICAgY2FzZTogXCJkZWxldGVXYXlwb2ludFwiO1xuICB9IHwge1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogbGlnaHRzcGVlZGR1ZWwud3MuQ2xlYXJXYXlwb2ludHMgY2xlYXJfd2F5cG9pbnRzID0gMTY7XG4gICAgICovXG4gICAgdmFsdWU6IENsZWFyV2F5cG9pbnRzO1xuICAgIGNhc2U6IFwiY2xlYXJXYXlwb2ludHNcIjtcbiAgfSB8IHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLkNvbmZpZ3VyZU1pc3NpbGUgY29uZmlndXJlX21pc3NpbGUgPSAxNztcbiAgICAgKi9cbiAgICB2YWx1ZTogQ29uZmlndXJlTWlzc2lsZTtcbiAgICBjYXNlOiBcImNvbmZpZ3VyZU1pc3NpbGVcIjtcbiAgfSB8IHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLkFkZE1pc3NpbGVXYXlwb2ludCBhZGRfbWlzc2lsZV93YXlwb2ludCA9IDE4O1xuICAgICAqL1xuICAgIHZhbHVlOiBBZGRNaXNzaWxlV2F5cG9pbnQ7XG4gICAgY2FzZTogXCJhZGRNaXNzaWxlV2F5cG9pbnRcIjtcbiAgfSB8IHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLlVwZGF0ZU1pc3NpbGVXYXlwb2ludFNwZWVkIHVwZGF0ZV9taXNzaWxlX3dheXBvaW50X3NwZWVkID0gMTk7XG4gICAgICovXG4gICAgdmFsdWU6IFVwZGF0ZU1pc3NpbGVXYXlwb2ludFNwZWVkO1xuICAgIGNhc2U6IFwidXBkYXRlTWlzc2lsZVdheXBvaW50U3BlZWRcIjtcbiAgfSB8IHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLk1vdmVNaXNzaWxlV2F5cG9pbnQgbW92ZV9taXNzaWxlX3dheXBvaW50ID0gMjA7XG4gICAgICovXG4gICAgdmFsdWU6IE1vdmVNaXNzaWxlV2F5cG9pbnQ7XG4gICAgY2FzZTogXCJtb3ZlTWlzc2lsZVdheXBvaW50XCI7XG4gIH0gfCB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5EZWxldGVNaXNzaWxlV2F5cG9pbnQgZGVsZXRlX21pc3NpbGVfd2F5cG9pbnQgPSAyMTtcbiAgICAgKi9cbiAgICB2YWx1ZTogRGVsZXRlTWlzc2lsZVdheXBvaW50O1xuICAgIGNhc2U6IFwiZGVsZXRlTWlzc2lsZVdheXBvaW50XCI7XG4gIH0gfCB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5DbGVhck1pc3NpbGVSb3V0ZSBjbGVhcl9taXNzaWxlX3JvdXRlID0gMjI7XG4gICAgICovXG4gICAgdmFsdWU6IENsZWFyTWlzc2lsZVJvdXRlO1xuICAgIGNhc2U6IFwiY2xlYXJNaXNzaWxlUm91dGVcIjtcbiAgfSB8IHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLkFkZE1pc3NpbGVSb3V0ZSBhZGRfbWlzc2lsZV9yb3V0ZSA9IDIzO1xuICAgICAqL1xuICAgIHZhbHVlOiBBZGRNaXNzaWxlUm91dGU7XG4gICAgY2FzZTogXCJhZGRNaXNzaWxlUm91dGVcIjtcbiAgfSB8IHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLlJlbmFtZU1pc3NpbGVSb3V0ZSByZW5hbWVfbWlzc2lsZV9yb3V0ZSA9IDI0O1xuICAgICAqL1xuICAgIHZhbHVlOiBSZW5hbWVNaXNzaWxlUm91dGU7XG4gICAgY2FzZTogXCJyZW5hbWVNaXNzaWxlUm91dGVcIjtcbiAgfSB8IHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLkRlbGV0ZU1pc3NpbGVSb3V0ZSBkZWxldGVfbWlzc2lsZV9yb3V0ZSA9IDI1O1xuICAgICAqL1xuICAgIHZhbHVlOiBEZWxldGVNaXNzaWxlUm91dGU7XG4gICAgY2FzZTogXCJkZWxldGVNaXNzaWxlUm91dGVcIjtcbiAgfSB8IHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLlNldEFjdGl2ZU1pc3NpbGVSb3V0ZSBzZXRfYWN0aXZlX21pc3NpbGVfcm91dGUgPSAyNjtcbiAgICAgKi9cbiAgICB2YWx1ZTogU2V0QWN0aXZlTWlzc2lsZVJvdXRlO1xuICAgIGNhc2U6IFwic2V0QWN0aXZlTWlzc2lsZVJvdXRlXCI7XG4gIH0gfCB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5MYXVuY2hNaXNzaWxlIGxhdW5jaF9taXNzaWxlID0gMjc7XG4gICAgICovXG4gICAgdmFsdWU6IExhdW5jaE1pc3NpbGU7XG4gICAgY2FzZTogXCJsYXVuY2hNaXNzaWxlXCI7XG4gIH0gfCB7XG4gICAgLyoqXG4gICAgICogUGhhc2UgMjogREFHIGNvbW1hbmRzXG4gICAgICpcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLkRhZ1N0YXJ0IGRhZ19zdGFydCA9IDMwO1xuICAgICAqL1xuICAgIHZhbHVlOiBEYWdTdGFydDtcbiAgICBjYXNlOiBcImRhZ1N0YXJ0XCI7XG4gIH0gfCB7XG4gICAgLyoqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5EYWdDYW5jZWwgZGFnX2NhbmNlbCA9IDMxO1xuICAgICAqL1xuICAgIHZhbHVlOiBEYWdDYW5jZWw7XG4gICAgY2FzZTogXCJkYWdDYW5jZWxcIjtcbiAgfSB8IHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLkRhZ1N0b3J5QWNrIGRhZ19zdG9yeV9hY2sgPSAzMjtcbiAgICAgKi9cbiAgICB2YWx1ZTogRGFnU3RvcnlBY2s7XG4gICAgY2FzZTogXCJkYWdTdG9yeUFja1wiO1xuICB9IHwge1xuICAgIC8qKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogbGlnaHRzcGVlZGR1ZWwud3MuRGFnTGlzdCBkYWdfbGlzdCA9IDMzO1xuICAgICAqL1xuICAgIHZhbHVlOiBEYWdMaXN0O1xuICAgIGNhc2U6IFwiZGFnTGlzdFwiO1xuICB9IHwge1xuICAgIC8qKlxuICAgICAqIFBoYXNlIDI6IE1pc3Npb24gY29tbWFuZHNcbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogbGlnaHRzcGVlZGR1ZWwud3MuTWlzc2lvblNwYXduV2F2ZSBtaXNzaW9uX3NwYXduX3dhdmUgPSA0MDtcbiAgICAgKi9cbiAgICB2YWx1ZTogTWlzc2lvblNwYXduV2F2ZTtcbiAgICBjYXNlOiBcIm1pc3Npb25TcGF3bldhdmVcIjtcbiAgfSB8IHtcbiAgICAvKipcbiAgICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLk1pc3Npb25TdG9yeUV2ZW50IG1pc3Npb25fc3RvcnlfZXZlbnQgPSA0MTtcbiAgICAgKi9cbiAgICB2YWx1ZTogTWlzc2lvblN0b3J5RXZlbnQ7XG4gICAgY2FzZTogXCJtaXNzaW9uU3RvcnlFdmVudFwiO1xuICB9IHwge1xuICAgIC8qKlxuICAgICAqIFBoYXNlIDI6IFNlcnZlciByZXNwb25zZXNcbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogbGlnaHRzcGVlZGR1ZWwud3MuRGFnTGlzdFJlc3BvbnNlIGRhZ19saXN0X3Jlc3BvbnNlID0gNTA7XG4gICAgICovXG4gICAgdmFsdWU6IERhZ0xpc3RSZXNwb25zZTtcbiAgICBjYXNlOiBcImRhZ0xpc3RSZXNwb25zZVwiO1xuICB9IHwgeyBjYXNlOiB1bmRlZmluZWQ7IHZhbHVlPzogdW5kZWZpbmVkIH07XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5Xc0VudmVsb3BlLlxuICogVXNlIGBjcmVhdGUoV3NFbnZlbG9wZVNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgV3NFbnZlbG9wZVNjaGVtYTogR2VuTWVzc2FnZTxXc0VudmVsb3BlPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMCk7XG5cbi8qKlxuICogU2VydmVyIFx1MjE5MiBDbGllbnQ6IEZ1bGwgZ2FtZSBzdGF0ZVxuICogU2VudCBldmVyeSB0aWNrICh+MjBIeikgY29udGFpbmluZyB0aGUgcGxheWVyJ3MgdmlldyBvZiB0aGUgZ2FtZSB3b3JsZFxuICogd2l0aCBsaWdodC1kZWxheWVkIHBvc2l0aW9ucyBvZiBvdGhlciBzaGlwcyBhbmQgbWlzc2lsZXNcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5TdGF0ZVVwZGF0ZVxuICovXG5leHBvcnQgdHlwZSBTdGF0ZVVwZGF0ZSA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5TdGF0ZVVwZGF0ZVwiPiAmIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIG5vdyA9IDE7XG4gICAqL1xuICBub3c6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5HaG9zdCBtZSA9IDI7XG4gICAqL1xuICBtZT86IEdob3N0O1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHJlcGVhdGVkIGxpZ2h0c3BlZWRkdWVsLndzLkdob3N0IGdob3N0cyA9IDM7XG4gICAqL1xuICBnaG9zdHM6IEdob3N0W107XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogbGlnaHRzcGVlZGR1ZWwud3MuUm9vbU1ldGEgbWV0YSA9IDQ7XG4gICAqL1xuICBtZXRhPzogUm9vbU1ldGE7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogcmVwZWF0ZWQgbGlnaHRzcGVlZGR1ZWwud3MuTWlzc2lsZSBtaXNzaWxlcyA9IDU7XG4gICAqL1xuICBtaXNzaWxlczogTWlzc2lsZVtdO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLk1pc3NpbGVDb25maWcgbWlzc2lsZV9jb25maWcgPSA2O1xuICAgKi9cbiAgbWlzc2lsZUNvbmZpZz86IE1pc3NpbGVDb25maWc7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogcmVwZWF0ZWQgbGlnaHRzcGVlZGR1ZWwud3MuV2F5cG9pbnQgbWlzc2lsZV93YXlwb2ludHMgPSA3O1xuICAgKi9cbiAgbWlzc2lsZVdheXBvaW50czogV2F5cG9pbnRbXTtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiByZXBlYXRlZCBsaWdodHNwZWVkZHVlbC53cy5NaXNzaWxlUm91dGUgbWlzc2lsZV9yb3V0ZXMgPSA4O1xuICAgKi9cbiAgbWlzc2lsZVJvdXRlczogTWlzc2lsZVJvdXRlW107XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIGFjdGl2ZV9taXNzaWxlX3JvdXRlID0gOTtcbiAgICovXG4gIGFjdGl2ZU1pc3NpbGVSb3V0ZTogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBuZXh0X21pc3NpbGVfcmVhZHkgPSAxMDtcbiAgICovXG4gIG5leHRNaXNzaWxlUmVhZHk6IG51bWJlcjtcblxuICAvKipcbiAgICogUGhhc2UgMiBhZGRpdGlvbnM6XG4gICAqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogb3B0aW9uYWwgbGlnaHRzcGVlZGR1ZWwud3MuRGFnU3RhdGUgZGFnID0gMTE7XG4gICAqL1xuICBkYWc/OiBEYWdTdGF0ZTtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBvcHRpb25hbCBsaWdodHNwZWVkZHVlbC53cy5JbnZlbnRvcnkgaW52ZW50b3J5ID0gMTI7XG4gICAqL1xuICBpbnZlbnRvcnk/OiBJbnZlbnRvcnk7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogb3B0aW9uYWwgbGlnaHRzcGVlZGR1ZWwud3MuU3RvcnlTdGF0ZSBzdG9yeSA9IDEzO1xuICAgKi9cbiAgc3Rvcnk/OiBTdG9yeVN0YXRlO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IG9wdGlvbmFsIGxpZ2h0c3BlZWRkdWVsLndzLlBsYXllckNhcGFiaWxpdGllcyBjYXBhYmlsaXRpZXMgPSAxNDtcbiAgICovXG4gIGNhcGFiaWxpdGllcz86IFBsYXllckNhcGFiaWxpdGllcztcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLlN0YXRlVXBkYXRlLlxuICogVXNlIGBjcmVhdGUoU3RhdGVVcGRhdGVTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IFN0YXRlVXBkYXRlU2NoZW1hOiBHZW5NZXNzYWdlPFN0YXRlVXBkYXRlPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMSk7XG5cbi8qKlxuICogU2VydmVyIFx1MjE5MiBDbGllbnQ6IFJvb20gZnVsbCBlcnJvclxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLlJvb21GdWxsRXJyb3JcbiAqL1xuZXhwb3J0IHR5cGUgUm9vbUZ1bGxFcnJvciA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5Sb29tRnVsbEVycm9yXCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgbWVzc2FnZSA9IDE7XG4gICAqL1xuICBtZXNzYWdlOiBzdHJpbmc7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5Sb29tRnVsbEVycm9yLlxuICogVXNlIGBjcmVhdGUoUm9vbUZ1bGxFcnJvclNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgUm9vbUZ1bGxFcnJvclNjaGVtYTogR2VuTWVzc2FnZTxSb29tRnVsbEVycm9yPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMik7XG5cbi8qKlxuICogQ2xpZW50IFx1MjE5MiBTZXJ2ZXI6IEpvaW4gZ2FtZVxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkNsaWVudEpvaW5cbiAqL1xuZXhwb3J0IHR5cGUgQ2xpZW50Sm9pbiA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5DbGllbnRKb2luXCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgbmFtZSA9IDE7XG4gICAqL1xuICBuYW1lOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIHJvb20gPSAyO1xuICAgKi9cbiAgcm9vbTogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBtYXBfdyA9IDM7XG4gICAqL1xuICBtYXBXOiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIG1hcF9oID0gNDtcbiAgICovXG4gIG1hcEg6IG51bWJlcjtcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkNsaWVudEpvaW4uXG4gKiBVc2UgYGNyZWF0ZShDbGllbnRKb2luU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBDbGllbnRKb2luU2NoZW1hOiBHZW5NZXNzYWdlPENsaWVudEpvaW4+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCAzKTtcblxuLyoqXG4gKiBDbGllbnQgXHUyMTkyIFNlcnZlcjogU3Bhd24gQUkgYm90XG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuU3Bhd25Cb3RcbiAqL1xuZXhwb3J0IHR5cGUgU3Bhd25Cb3QgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuU3Bhd25Cb3RcIj4gJiB7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5TcGF3bkJvdC5cbiAqIFVzZSBgY3JlYXRlKFNwYXduQm90U2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBTcGF3bkJvdFNjaGVtYTogR2VuTWVzc2FnZTxTcGF3bkJvdD4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDQpO1xuXG4vKipcbiAqIENsaWVudCBcdTIxOTIgU2VydmVyOiBBZGQgd2F5cG9pbnQgdG8gc2hpcCByb3V0ZVxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkFkZFdheXBvaW50XG4gKi9cbmV4cG9ydCB0eXBlIEFkZFdheXBvaW50ID0gTWVzc2FnZTxcImxpZ2h0c3BlZWRkdWVsLndzLkFkZFdheXBvaW50XCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgeCA9IDE7XG4gICAqL1xuICB4OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHkgPSAyO1xuICAgKi9cbiAgeTogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBzcGVlZCA9IDM7XG4gICAqL1xuICBzcGVlZDogbnVtYmVyO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuQWRkV2F5cG9pbnQuXG4gKiBVc2UgYGNyZWF0ZShBZGRXYXlwb2ludFNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgQWRkV2F5cG9pbnRTY2hlbWE6IEdlbk1lc3NhZ2U8QWRkV2F5cG9pbnQ+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCA1KTtcblxuLyoqXG4gKiBDbGllbnQgXHUyMTkyIFNlcnZlcjogVXBkYXRlIHdheXBvaW50IHNwZWVkXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuVXBkYXRlV2F5cG9pbnRcbiAqL1xuZXhwb3J0IHR5cGUgVXBkYXRlV2F5cG9pbnQgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuVXBkYXRlV2F5cG9pbnRcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGludDMyIGluZGV4ID0gMTtcbiAgICovXG4gIGluZGV4OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHNwZWVkID0gMjtcbiAgICovXG4gIHNwZWVkOiBudW1iZXI7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5VcGRhdGVXYXlwb2ludC5cbiAqIFVzZSBgY3JlYXRlKFVwZGF0ZVdheXBvaW50U2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBVcGRhdGVXYXlwb2ludFNjaGVtYTogR2VuTWVzc2FnZTxVcGRhdGVXYXlwb2ludD4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDYpO1xuXG4vKipcbiAqIENsaWVudCBcdTIxOTIgU2VydmVyOiBNb3ZlIHdheXBvaW50IHBvc2l0aW9uXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuTW92ZVdheXBvaW50XG4gKi9cbmV4cG9ydCB0eXBlIE1vdmVXYXlwb2ludCA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5Nb3ZlV2F5cG9pbnRcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGludDMyIGluZGV4ID0gMTtcbiAgICovXG4gIGluZGV4OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHggPSAyO1xuICAgKi9cbiAgeDogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSB5ID0gMztcbiAgICovXG4gIHk6IG51bWJlcjtcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLk1vdmVXYXlwb2ludC5cbiAqIFVzZSBgY3JlYXRlKE1vdmVXYXlwb2ludFNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgTW92ZVdheXBvaW50U2NoZW1hOiBHZW5NZXNzYWdlPE1vdmVXYXlwb2ludD4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDcpO1xuXG4vKipcbiAqIENsaWVudCBcdTIxOTIgU2VydmVyOiBEZWxldGUgd2F5cG9pbnQgZnJvbSByb3V0ZVxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkRlbGV0ZVdheXBvaW50XG4gKi9cbmV4cG9ydCB0eXBlIERlbGV0ZVdheXBvaW50ID0gTWVzc2FnZTxcImxpZ2h0c3BlZWRkdWVsLndzLkRlbGV0ZVdheXBvaW50XCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBpbnQzMiBpbmRleCA9IDE7XG4gICAqL1xuICBpbmRleDogbnVtYmVyO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuRGVsZXRlV2F5cG9pbnQuXG4gKiBVc2UgYGNyZWF0ZShEZWxldGVXYXlwb2ludFNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgRGVsZXRlV2F5cG9pbnRTY2hlbWE6IEdlbk1lc3NhZ2U8RGVsZXRlV2F5cG9pbnQ+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCA4KTtcblxuLyoqXG4gKiBDbGllbnQgXHUyMTkyIFNlcnZlcjogQ2xlYXIgYWxsIHdheXBvaW50c1xuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkNsZWFyV2F5cG9pbnRzXG4gKi9cbmV4cG9ydCB0eXBlIENsZWFyV2F5cG9pbnRzID0gTWVzc2FnZTxcImxpZ2h0c3BlZWRkdWVsLndzLkNsZWFyV2F5cG9pbnRzXCI+ICYge1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuQ2xlYXJXYXlwb2ludHMuXG4gKiBVc2UgYGNyZWF0ZShDbGVhcldheXBvaW50c1NjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgQ2xlYXJXYXlwb2ludHNTY2hlbWE6IEdlbk1lc3NhZ2U8Q2xlYXJXYXlwb2ludHM+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCA5KTtcblxuLyoqXG4gKiBDbGllbnQgXHUyMTkyIFNlcnZlcjogQ29uZmlndXJlIG1pc3NpbGUgcGFyYW1ldGVyc1xuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkNvbmZpZ3VyZU1pc3NpbGVcbiAqL1xuZXhwb3J0IHR5cGUgQ29uZmlndXJlTWlzc2lsZSA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5Db25maWd1cmVNaXNzaWxlXCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgbWlzc2lsZV9zcGVlZCA9IDE7XG4gICAqL1xuICBtaXNzaWxlU3BlZWQ6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgbWlzc2lsZV9hZ3JvID0gMjtcbiAgICovXG4gIG1pc3NpbGVBZ3JvOiBudW1iZXI7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5Db25maWd1cmVNaXNzaWxlLlxuICogVXNlIGBjcmVhdGUoQ29uZmlndXJlTWlzc2lsZVNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgQ29uZmlndXJlTWlzc2lsZVNjaGVtYTogR2VuTWVzc2FnZTxDb25maWd1cmVNaXNzaWxlPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMTApO1xuXG4vKipcbiAqIENsaWVudCBcdTIxOTIgU2VydmVyOiBBZGQgd2F5cG9pbnQgdG8gbWlzc2lsZSByb3V0ZVxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkFkZE1pc3NpbGVXYXlwb2ludFxuICovXG5leHBvcnQgdHlwZSBBZGRNaXNzaWxlV2F5cG9pbnQgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuQWRkTWlzc2lsZVdheXBvaW50XCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgcm91dGVfaWQgPSAxO1xuICAgKi9cbiAgcm91dGVJZDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSB4ID0gMjtcbiAgICovXG4gIHg6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgeSA9IDM7XG4gICAqL1xuICB5OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHNwZWVkID0gNDtcbiAgICovXG4gIHNwZWVkOiBudW1iZXI7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5BZGRNaXNzaWxlV2F5cG9pbnQuXG4gKiBVc2UgYGNyZWF0ZShBZGRNaXNzaWxlV2F5cG9pbnRTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEFkZE1pc3NpbGVXYXlwb2ludFNjaGVtYTogR2VuTWVzc2FnZTxBZGRNaXNzaWxlV2F5cG9pbnQ+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCAxMSk7XG5cbi8qKlxuICogQ2xpZW50IFx1MjE5MiBTZXJ2ZXI6IFVwZGF0ZSBtaXNzaWxlIHdheXBvaW50IHNwZWVkXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuVXBkYXRlTWlzc2lsZVdheXBvaW50U3BlZWRcbiAqL1xuZXhwb3J0IHR5cGUgVXBkYXRlTWlzc2lsZVdheXBvaW50U3BlZWQgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuVXBkYXRlTWlzc2lsZVdheXBvaW50U3BlZWRcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyByb3V0ZV9pZCA9IDE7XG4gICAqL1xuICByb3V0ZUlkOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogaW50MzIgaW5kZXggPSAyO1xuICAgKi9cbiAgaW5kZXg6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgc3BlZWQgPSAzO1xuICAgKi9cbiAgc3BlZWQ6IG51bWJlcjtcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLlVwZGF0ZU1pc3NpbGVXYXlwb2ludFNwZWVkLlxuICogVXNlIGBjcmVhdGUoVXBkYXRlTWlzc2lsZVdheXBvaW50U3BlZWRTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IFVwZGF0ZU1pc3NpbGVXYXlwb2ludFNwZWVkU2NoZW1hOiBHZW5NZXNzYWdlPFVwZGF0ZU1pc3NpbGVXYXlwb2ludFNwZWVkPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMTIpO1xuXG4vKipcbiAqIENsaWVudCBcdTIxOTIgU2VydmVyOiBNb3ZlIG1pc3NpbGUgd2F5cG9pbnQgcG9zaXRpb25cbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5Nb3ZlTWlzc2lsZVdheXBvaW50XG4gKi9cbmV4cG9ydCB0eXBlIE1vdmVNaXNzaWxlV2F5cG9pbnQgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuTW92ZU1pc3NpbGVXYXlwb2ludFwiPiAmIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIHJvdXRlX2lkID0gMTtcbiAgICovXG4gIHJvdXRlSWQ6IHN0cmluZztcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBpbnQzMiBpbmRleCA9IDI7XG4gICAqL1xuICBpbmRleDogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSB4ID0gMztcbiAgICovXG4gIHg6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgeSA9IDQ7XG4gICAqL1xuICB5OiBudW1iZXI7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5Nb3ZlTWlzc2lsZVdheXBvaW50LlxuICogVXNlIGBjcmVhdGUoTW92ZU1pc3NpbGVXYXlwb2ludFNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgTW92ZU1pc3NpbGVXYXlwb2ludFNjaGVtYTogR2VuTWVzc2FnZTxNb3ZlTWlzc2lsZVdheXBvaW50PiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMTMpO1xuXG4vKipcbiAqIENsaWVudCBcdTIxOTIgU2VydmVyOiBEZWxldGUgbWlzc2lsZSB3YXlwb2ludFxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkRlbGV0ZU1pc3NpbGVXYXlwb2ludFxuICovXG5leHBvcnQgdHlwZSBEZWxldGVNaXNzaWxlV2F5cG9pbnQgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuRGVsZXRlTWlzc2lsZVdheXBvaW50XCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgcm91dGVfaWQgPSAxO1xuICAgKi9cbiAgcm91dGVJZDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGludDMyIGluZGV4ID0gMjtcbiAgICovXG4gIGluZGV4OiBudW1iZXI7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5EZWxldGVNaXNzaWxlV2F5cG9pbnQuXG4gKiBVc2UgYGNyZWF0ZShEZWxldGVNaXNzaWxlV2F5cG9pbnRTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IERlbGV0ZU1pc3NpbGVXYXlwb2ludFNjaGVtYTogR2VuTWVzc2FnZTxEZWxldGVNaXNzaWxlV2F5cG9pbnQ+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCAxNCk7XG5cbi8qKlxuICogQ2xpZW50IFx1MjE5MiBTZXJ2ZXI6IENsZWFyIG1pc3NpbGUgcm91dGUgd2F5cG9pbnRzXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuQ2xlYXJNaXNzaWxlUm91dGVcbiAqL1xuZXhwb3J0IHR5cGUgQ2xlYXJNaXNzaWxlUm91dGUgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuQ2xlYXJNaXNzaWxlUm91dGVcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyByb3V0ZV9pZCA9IDE7XG4gICAqL1xuICByb3V0ZUlkOiBzdHJpbmc7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5DbGVhck1pc3NpbGVSb3V0ZS5cbiAqIFVzZSBgY3JlYXRlKENsZWFyTWlzc2lsZVJvdXRlU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBDbGVhck1pc3NpbGVSb3V0ZVNjaGVtYTogR2VuTWVzc2FnZTxDbGVhck1pc3NpbGVSb3V0ZT4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDE1KTtcblxuLyoqXG4gKiBDbGllbnQgXHUyMTkyIFNlcnZlcjogQ3JlYXRlIG5ldyBtaXNzaWxlIHJvdXRlXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuQWRkTWlzc2lsZVJvdXRlXG4gKi9cbmV4cG9ydCB0eXBlIEFkZE1pc3NpbGVSb3V0ZSA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5BZGRNaXNzaWxlUm91dGVcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyBuYW1lID0gMTtcbiAgICovXG4gIG5hbWU6IHN0cmluZztcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkFkZE1pc3NpbGVSb3V0ZS5cbiAqIFVzZSBgY3JlYXRlKEFkZE1pc3NpbGVSb3V0ZVNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgQWRkTWlzc2lsZVJvdXRlU2NoZW1hOiBHZW5NZXNzYWdlPEFkZE1pc3NpbGVSb3V0ZT4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDE2KTtcblxuLyoqXG4gKiBDbGllbnQgXHUyMTkyIFNlcnZlcjogUmVuYW1lIG1pc3NpbGUgcm91dGVcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5SZW5hbWVNaXNzaWxlUm91dGVcbiAqL1xuZXhwb3J0IHR5cGUgUmVuYW1lTWlzc2lsZVJvdXRlID0gTWVzc2FnZTxcImxpZ2h0c3BlZWRkdWVsLndzLlJlbmFtZU1pc3NpbGVSb3V0ZVwiPiAmIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIHJvdXRlX2lkID0gMTtcbiAgICovXG4gIHJvdXRlSWQ6IHN0cmluZztcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgbmFtZSA9IDI7XG4gICAqL1xuICBuYW1lOiBzdHJpbmc7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5SZW5hbWVNaXNzaWxlUm91dGUuXG4gKiBVc2UgYGNyZWF0ZShSZW5hbWVNaXNzaWxlUm91dGVTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IFJlbmFtZU1pc3NpbGVSb3V0ZVNjaGVtYTogR2VuTWVzc2FnZTxSZW5hbWVNaXNzaWxlUm91dGU+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCAxNyk7XG5cbi8qKlxuICogQ2xpZW50IFx1MjE5MiBTZXJ2ZXI6IERlbGV0ZSBtaXNzaWxlIHJvdXRlXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuRGVsZXRlTWlzc2lsZVJvdXRlXG4gKi9cbmV4cG9ydCB0eXBlIERlbGV0ZU1pc3NpbGVSb3V0ZSA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5EZWxldGVNaXNzaWxlUm91dGVcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyByb3V0ZV9pZCA9IDE7XG4gICAqL1xuICByb3V0ZUlkOiBzdHJpbmc7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5EZWxldGVNaXNzaWxlUm91dGUuXG4gKiBVc2UgYGNyZWF0ZShEZWxldGVNaXNzaWxlUm91dGVTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IERlbGV0ZU1pc3NpbGVSb3V0ZVNjaGVtYTogR2VuTWVzc2FnZTxEZWxldGVNaXNzaWxlUm91dGU+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCAxOCk7XG5cbi8qKlxuICogQ2xpZW50IFx1MjE5MiBTZXJ2ZXI6IFNldCBhY3RpdmUgbWlzc2lsZSByb3V0ZVxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLlNldEFjdGl2ZU1pc3NpbGVSb3V0ZVxuICovXG5leHBvcnQgdHlwZSBTZXRBY3RpdmVNaXNzaWxlUm91dGUgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuU2V0QWN0aXZlTWlzc2lsZVJvdXRlXCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgcm91dGVfaWQgPSAxO1xuICAgKi9cbiAgcm91dGVJZDogc3RyaW5nO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuU2V0QWN0aXZlTWlzc2lsZVJvdXRlLlxuICogVXNlIGBjcmVhdGUoU2V0QWN0aXZlTWlzc2lsZVJvdXRlU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBTZXRBY3RpdmVNaXNzaWxlUm91dGVTY2hlbWE6IEdlbk1lc3NhZ2U8U2V0QWN0aXZlTWlzc2lsZVJvdXRlPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMTkpO1xuXG4vKipcbiAqIENsaWVudCBcdTIxOTIgU2VydmVyOiBMYXVuY2ggbWlzc2lsZSBvbiByb3V0ZVxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkxhdW5jaE1pc3NpbGVcbiAqL1xuZXhwb3J0IHR5cGUgTGF1bmNoTWlzc2lsZSA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5MYXVuY2hNaXNzaWxlXCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgcm91dGVfaWQgPSAxO1xuICAgKi9cbiAgcm91dGVJZDogc3RyaW5nO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuTGF1bmNoTWlzc2lsZS5cbiAqIFVzZSBgY3JlYXRlKExhdW5jaE1pc3NpbGVTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IExhdW5jaE1pc3NpbGVTY2hlbWE6IEdlbk1lc3NhZ2U8TGF1bmNoTWlzc2lsZT4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDIwKTtcblxuLyoqXG4gKiBTaGlwL2dob3N0IHNuYXBzaG90IHdpdGggcG9zaXRpb24sIHZlbG9jaXR5LCBhbmQgc3RhdGVcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5HaG9zdFxuICovXG5leHBvcnQgdHlwZSBHaG9zdCA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5HaG9zdFwiPiAmIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIGlkID0gMTtcbiAgICovXG4gIGlkOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHggPSAyO1xuICAgKi9cbiAgeDogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSB5ID0gMztcbiAgICovXG4gIHk6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgdnggPSA0O1xuICAgKi9cbiAgdng6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgdnkgPSA1O1xuICAgKi9cbiAgdnk6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgdCA9IDY7XG4gICAqL1xuICB0OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogYm9vbCBzZWxmID0gNztcbiAgICovXG4gIHNlbGY6IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogcmVwZWF0ZWQgbGlnaHRzcGVlZGR1ZWwud3MuV2F5cG9pbnQgd2F5cG9pbnRzID0gODtcbiAgICovXG4gIHdheXBvaW50czogV2F5cG9pbnRbXTtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBpbnQzMiBjdXJyZW50X3dheXBvaW50X2luZGV4ID0gOTtcbiAgICovXG4gIGN1cnJlbnRXYXlwb2ludEluZGV4OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogaW50MzIgaHAgPSAxMDtcbiAgICovXG4gIGhwOiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogaW50MzIga2lsbHMgPSAxMTtcbiAgICovXG4gIGtpbGxzOiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogb3B0aW9uYWwgbGlnaHRzcGVlZGR1ZWwud3MuU2hpcEhlYXRWaWV3IGhlYXQgPSAxMjtcbiAgICovXG4gIGhlYXQ/OiBTaGlwSGVhdFZpZXc7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5HaG9zdC5cbiAqIFVzZSBgY3JlYXRlKEdob3N0U2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBHaG9zdFNjaGVtYTogR2VuTWVzc2FnZTxHaG9zdD4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDIxKTtcblxuLyoqXG4gKiBXYXlwb2ludCB3aXRoIHBvc2l0aW9uIGFuZCB0YXJnZXQgc3BlZWRcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5XYXlwb2ludFxuICovXG5leHBvcnQgdHlwZSBXYXlwb2ludCA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5XYXlwb2ludFwiPiAmIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHggPSAxO1xuICAgKi9cbiAgeDogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSB5ID0gMjtcbiAgICovXG4gIHk6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgc3BlZWQgPSAzO1xuICAgKi9cbiAgc3BlZWQ6IG51bWJlcjtcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLldheXBvaW50LlxuICogVXNlIGBjcmVhdGUoV2F5cG9pbnRTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IFdheXBvaW50U2NoZW1hOiBHZW5NZXNzYWdlPFdheXBvaW50PiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMjIpO1xuXG4vKipcbiAqIFJvb20gY29uc3RhbnRzIChzcGVlZCBvZiBsaWdodCwgd29ybGQgZGltZW5zaW9ucylcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5Sb29tTWV0YVxuICovXG5leHBvcnQgdHlwZSBSb29tTWV0YSA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5Sb29tTWV0YVwiPiAmIHtcbiAgLyoqXG4gICAqIFNwZWVkIG9mIGxpZ2h0XG4gICAqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIGMgPSAxO1xuICAgKi9cbiAgYzogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBXb3JsZCB3aWR0aFxuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSB3ID0gMjtcbiAgICovXG4gIHc6IG51bWJlcjtcblxuICAvKipcbiAgICogV29ybGQgaGVpZ2h0XG4gICAqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIGggPSAzO1xuICAgKi9cbiAgaDogbnVtYmVyO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuUm9vbU1ldGEuXG4gKiBVc2UgYGNyZWF0ZShSb29tTWV0YVNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgUm9vbU1ldGFTY2hlbWE6IEdlbk1lc3NhZ2U8Um9vbU1ldGE+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCAyMyk7XG5cbi8qKlxuICogTWlzc2lsZSBzbmFwc2hvdCB3aXRoIHBvc2l0aW9uLCB2ZWxvY2l0eSwgYW5kIHRhcmdldGluZ1xuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLk1pc3NpbGVcbiAqL1xuZXhwb3J0IHR5cGUgTWlzc2lsZSA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5NaXNzaWxlXCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgaWQgPSAxO1xuICAgKi9cbiAgaWQ6IHN0cmluZztcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgb3duZXIgPSAyO1xuICAgKi9cbiAgb3duZXI6IHN0cmluZztcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBib29sIHNlbGYgPSAzO1xuICAgKi9cbiAgc2VsZjogYm9vbGVhbjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgeCA9IDQ7XG4gICAqL1xuICB4OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHkgPSA1O1xuICAgKi9cbiAgeTogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSB2eCA9IDY7XG4gICAqL1xuICB2eDogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSB2eSA9IDc7XG4gICAqL1xuICB2eTogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSB0ID0gODtcbiAgICovXG4gIHQ6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgYWdyb19yYWRpdXMgPSA5O1xuICAgKi9cbiAgYWdyb1JhZGl1czogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBsaWZldGltZSA9IDEwO1xuICAgKi9cbiAgbGlmZXRpbWU6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgbGF1bmNoX3RpbWUgPSAxMTtcbiAgICovXG4gIGxhdW5jaFRpbWU6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgZXhwaXJlc19hdCA9IDEyO1xuICAgKi9cbiAgZXhwaXJlc0F0OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIHRhcmdldF9pZCA9IDEzO1xuICAgKi9cbiAgdGFyZ2V0SWQ6IHN0cmluZztcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBvcHRpb25hbCBsaWdodHNwZWVkZHVlbC53cy5TaGlwSGVhdFZpZXcgaGVhdCA9IDE0O1xuICAgKi9cbiAgaGVhdD86IFNoaXBIZWF0Vmlldztcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLk1pc3NpbGUuXG4gKiBVc2UgYGNyZWF0ZShNaXNzaWxlU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBNaXNzaWxlU2NoZW1hOiBHZW5NZXNzYWdlPE1pc3NpbGU+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCAyNCk7XG5cbi8qKlxuICogTWlzc2lsZSBjb25maWd1cmF0aW9uIHBhcmFtZXRlcnNcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5NaXNzaWxlQ29uZmlnXG4gKi9cbmV4cG9ydCB0eXBlIE1pc3NpbGVDb25maWcgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuTWlzc2lsZUNvbmZpZ1wiPiAmIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHNwZWVkID0gMTtcbiAgICovXG4gIHNwZWVkOiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHNwZWVkX21pbiA9IDI7XG4gICAqL1xuICBzcGVlZE1pbjogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBzcGVlZF9tYXggPSAzO1xuICAgKi9cbiAgc3BlZWRNYXg6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgYWdyb19taW4gPSA0O1xuICAgKi9cbiAgYWdyb01pbjogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBhZ3JvX3JhZGl1cyA9IDU7XG4gICAqL1xuICBhZ3JvUmFkaXVzOiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIGxpZmV0aW1lID0gNjtcbiAgICovXG4gIGxpZmV0aW1lOiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogb3B0aW9uYWwgbGlnaHRzcGVlZGR1ZWwud3MuSGVhdFBhcmFtcyBoZWF0X2NvbmZpZyA9IDc7XG4gICAqL1xuICBoZWF0Q29uZmlnPzogSGVhdFBhcmFtcztcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLk1pc3NpbGVDb25maWcuXG4gKiBVc2UgYGNyZWF0ZShNaXNzaWxlQ29uZmlnU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBNaXNzaWxlQ29uZmlnU2NoZW1hOiBHZW5NZXNzYWdlPE1pc3NpbGVDb25maWc+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCAyNSk7XG5cbi8qKlxuICogTWlzc2lsZSByb3V0ZSBkZWZpbml0aW9uXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuTWlzc2lsZVJvdXRlXG4gKi9cbmV4cG9ydCB0eXBlIE1pc3NpbGVSb3V0ZSA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5NaXNzaWxlUm91dGVcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyBpZCA9IDE7XG4gICAqL1xuICBpZDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyBuYW1lID0gMjtcbiAgICovXG4gIG5hbWU6IHN0cmluZztcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiByZXBlYXRlZCBsaWdodHNwZWVkZHVlbC53cy5XYXlwb2ludCB3YXlwb2ludHMgPSAzO1xuICAgKi9cbiAgd2F5cG9pbnRzOiBXYXlwb2ludFtdO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuTWlzc2lsZVJvdXRlLlxuICogVXNlIGBjcmVhdGUoTWlzc2lsZVJvdXRlU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBNaXNzaWxlUm91dGVTY2hlbWE6IEdlbk1lc3NhZ2U8TWlzc2lsZVJvdXRlPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMjYpO1xuXG4vKipcbiAqIEhlYXQgdmlldyAoYWJicmV2aWF0ZWQgZmllbGQgbmFtZXMgbWF0Y2ggSlNPTilcbiAqIFVzZWQgZm9yIGJvdGggc2hpcHMgYW5kIG1pc3NpbGVzXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuU2hpcEhlYXRWaWV3XG4gKi9cbmV4cG9ydCB0eXBlIFNoaXBIZWF0VmlldyA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5TaGlwSGVhdFZpZXdcIj4gJiB7XG4gIC8qKlxuICAgKiB2YWx1ZVxuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSB2ID0gMTtcbiAgICovXG4gIHY6IG51bWJlcjtcblxuICAvKipcbiAgICogbWF4XG4gICAqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIG0gPSAyO1xuICAgKi9cbiAgbTogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiB3YXJuQXRcbiAgICpcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgdyA9IDM7XG4gICAqL1xuICB3OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIG92ZXJoZWF0QXRcbiAgICpcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgbyA9IDQ7XG4gICAqL1xuICBvOiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIG1hcmtlclNwZWVkXG4gICAqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIG1zID0gNTtcbiAgICovXG4gIG1zOiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIHN0YWxsVW50aWxcbiAgICpcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgc3UgPSA2O1xuICAgKi9cbiAgc3U6IG51bWJlcjtcblxuICAvKipcbiAgICoga1VwXG4gICAqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIGt1ID0gNztcbiAgICovXG4gIGt1OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIGtEb3duXG4gICAqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIGtkID0gODtcbiAgICovXG4gIGtkOiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIGV4cFxuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBleCA9IDk7XG4gICAqL1xuICBleDogbnVtYmVyO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuU2hpcEhlYXRWaWV3LlxuICogVXNlIGBjcmVhdGUoU2hpcEhlYXRWaWV3U2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBTaGlwSGVhdFZpZXdTY2hlbWE6IEdlbk1lc3NhZ2U8U2hpcEhlYXRWaWV3PiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMjcpO1xuXG4vKipcbiAqIEhlYXQgY29uZmlndXJhdGlvbiBwYXJhbWV0ZXJzXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuSGVhdFBhcmFtc1xuICovXG5leHBvcnQgdHlwZSBIZWF0UGFyYW1zID0gTWVzc2FnZTxcImxpZ2h0c3BlZWRkdWVsLndzLkhlYXRQYXJhbXNcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBtYXggPSAxO1xuICAgKi9cbiAgbWF4OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHdhcm5fYXQgPSAyO1xuICAgKi9cbiAgd2FybkF0OiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIG92ZXJoZWF0X2F0ID0gMztcbiAgICovXG4gIG92ZXJoZWF0QXQ6IG51bWJlcjtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgbWFya2VyX3NwZWVkID0gNDtcbiAgICovXG4gIG1hcmtlclNwZWVkOiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIGtfdXAgPSA1O1xuICAgKi9cbiAga1VwOiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIGtfZG93biA9IDY7XG4gICAqL1xuICBrRG93bjogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBleHAgPSA3O1xuICAgKi9cbiAgZXhwOiBudW1iZXI7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5IZWF0UGFyYW1zLlxuICogVXNlIGBjcmVhdGUoSGVhdFBhcmFtc1NjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgSGVhdFBhcmFtc1NjaGVtYTogR2VuTWVzc2FnZTxIZWF0UGFyYW1zPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMjgpO1xuXG4vKipcbiAqIFVwZ3JhZGUgZWZmZWN0IGRlZmluaXRpb25cbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5VcGdyYWRlRWZmZWN0XG4gKi9cbmV4cG9ydCB0eXBlIFVwZ3JhZGVFZmZlY3QgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuVXBncmFkZUVmZmVjdFwiPiAmIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogbGlnaHRzcGVlZGR1ZWwud3MuVXBncmFkZUVmZmVjdFR5cGUgdHlwZSA9IDE7XG4gICAqL1xuICB0eXBlOiBVcGdyYWRlRWZmZWN0VHlwZTtcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIG9uZW9mIGxpZ2h0c3BlZWRkdWVsLndzLlVwZ3JhZGVFZmZlY3QudmFsdWVcbiAgICovXG4gIHZhbHVlOiB7XG4gICAgLyoqXG4gICAgICogRm9yIHNwZWVkL2hlYXQgbXVsdGlwbGllcnNcbiAgICAgKlxuICAgICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIG11bHRpcGxpZXIgPSAyO1xuICAgICAqL1xuICAgIHZhbHVlOiBudW1iZXI7XG4gICAgY2FzZTogXCJtdWx0aXBsaWVyXCI7XG4gIH0gfCB7XG4gICAgLyoqXG4gICAgICogRm9yIG1pc3NpbGUgdW5sb2NrcyAoZS5nLiwgXCJzY291dFwiKVxuICAgICAqXG4gICAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgdW5sb2NrX2lkID0gMztcbiAgICAgKi9cbiAgICB2YWx1ZTogc3RyaW5nO1xuICAgIGNhc2U6IFwidW5sb2NrSWRcIjtcbiAgfSB8IHsgY2FzZTogdW5kZWZpbmVkOyB2YWx1ZT86IHVuZGVmaW5lZCB9O1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuVXBncmFkZUVmZmVjdC5cbiAqIFVzZSBgY3JlYXRlKFVwZ3JhZGVFZmZlY3RTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IFVwZ3JhZGVFZmZlY3RTY2hlbWE6IEdlbk1lc3NhZ2U8VXBncmFkZUVmZmVjdD4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDI5KTtcblxuLyoqXG4gKiBQbGF5ZXIgY2FwYWJpbGl0aWVzIChjb21wdXRlZCBmcm9tIGNvbXBsZXRlZCB1cGdyYWRlcylcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5QbGF5ZXJDYXBhYmlsaXRpZXNcbiAqL1xuZXhwb3J0IHR5cGUgUGxheWVyQ2FwYWJpbGl0aWVzID0gTWVzc2FnZTxcImxpZ2h0c3BlZWRkdWVsLndzLlBsYXllckNhcGFiaWxpdGllc1wiPiAmIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogZG91YmxlIHNwZWVkX211bHRpcGxpZXIgPSAxO1xuICAgKi9cbiAgc3BlZWRNdWx0aXBsaWVyOiBudW1iZXI7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogcmVwZWF0ZWQgc3RyaW5nIHVubG9ja2VkX21pc3NpbGVzID0gMjtcbiAgICovXG4gIHVubG9ja2VkTWlzc2lsZXM6IHN0cmluZ1tdO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBoZWF0X2NhcGFjaXR5ID0gMztcbiAgICovXG4gIGhlYXRDYXBhY2l0eTogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBoZWF0X2VmZmljaWVuY3kgPSA0O1xuICAgKi9cbiAgaGVhdEVmZmljaWVuY3k6IG51bWJlcjtcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLlBsYXllckNhcGFiaWxpdGllcy5cbiAqIFVzZSBgY3JlYXRlKFBsYXllckNhcGFiaWxpdGllc1NjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgUGxheWVyQ2FwYWJpbGl0aWVzU2NoZW1hOiBHZW5NZXNzYWdlPFBsYXllckNhcGFiaWxpdGllcz4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDMwKTtcblxuLyoqXG4gKiBEQUcgbm9kZSBzdGF0ZVxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkRhZ05vZGVcbiAqL1xuZXhwb3J0IHR5cGUgRGFnTm9kZSA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5EYWdOb2RlXCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgaWQgPSAxO1xuICAgKi9cbiAgaWQ6IHN0cmluZztcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBsaWdodHNwZWVkZHVlbC53cy5EYWdOb2RlS2luZCBraW5kID0gMjtcbiAgICovXG4gIGtpbmQ6IERhZ05vZGVLaW5kO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyBsYWJlbCA9IDM7XG4gICAqL1xuICBsYWJlbDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLkRhZ05vZGVTdGF0dXMgc3RhdHVzID0gNDtcbiAgICovXG4gIHN0YXR1czogRGFnTm9kZVN0YXR1cztcblxuICAvKipcbiAgICogVGltZSByZW1haW5pbmcgZm9yIGluLXByb2dyZXNzIGpvYnNcbiAgICpcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgcmVtYWluaW5nX3MgPSA1O1xuICAgKi9cbiAgcmVtYWluaW5nUzogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBUb3RhbCBkdXJhdGlvblxuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGRvdWJsZSBkdXJhdGlvbl9zID0gNjtcbiAgICovXG4gIGR1cmF0aW9uUzogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBDYW4gYmUgcmVwZWF0ZWQgYWZ0ZXIgY29tcGxldGlvblxuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGJvb2wgcmVwZWF0YWJsZSA9IDc7XG4gICAqL1xuICByZXBlYXRhYmxlOiBib29sZWFuO1xuXG4gIC8qKlxuICAgKiBPbmx5IHBvcHVsYXRlZCBmb3IgdXBncmFkZSBub2Rlc1xuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHJlcGVhdGVkIGxpZ2h0c3BlZWRkdWVsLndzLlVwZ3JhZGVFZmZlY3QgZWZmZWN0cyA9IDg7XG4gICAqL1xuICBlZmZlY3RzOiBVcGdyYWRlRWZmZWN0W107XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5EYWdOb2RlLlxuICogVXNlIGBjcmVhdGUoRGFnTm9kZVNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgRGFnTm9kZVNjaGVtYTogR2VuTWVzc2FnZTxEYWdOb2RlPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMzEpO1xuXG4vKipcbiAqIEZ1bGwgREFHIHN0YXRlXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuRGFnU3RhdGVcbiAqL1xuZXhwb3J0IHR5cGUgRGFnU3RhdGUgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuRGFnU3RhdGVcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHJlcGVhdGVkIGxpZ2h0c3BlZWRkdWVsLndzLkRhZ05vZGUgbm9kZXMgPSAxO1xuICAgKi9cbiAgbm9kZXM6IERhZ05vZGVbXTtcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkRhZ1N0YXRlLlxuICogVXNlIGBjcmVhdGUoRGFnU3RhdGVTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IERhZ1N0YXRlU2NoZW1hOiBHZW5NZXNzYWdlPERhZ1N0YXRlPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMzIpO1xuXG4vKipcbiAqIENsaWVudCBcdTIxOTIgU2VydmVyOiBTdGFydCBhIERBRyBub2RlXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuRGFnU3RhcnRcbiAqL1xuZXhwb3J0IHR5cGUgRGFnU3RhcnQgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuRGFnU3RhcnRcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyBub2RlX2lkID0gMTtcbiAgICovXG4gIG5vZGVJZDogc3RyaW5nO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuRGFnU3RhcnQuXG4gKiBVc2UgYGNyZWF0ZShEYWdTdGFydFNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgRGFnU3RhcnRTY2hlbWE6IEdlbk1lc3NhZ2U8RGFnU3RhcnQ+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCAzMyk7XG5cbi8qKlxuICogQ2xpZW50IFx1MjE5MiBTZXJ2ZXI6IENhbmNlbCBhIERBRyBub2RlXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuRGFnQ2FuY2VsXG4gKi9cbmV4cG9ydCB0eXBlIERhZ0NhbmNlbCA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5EYWdDYW5jZWxcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyBub2RlX2lkID0gMTtcbiAgICovXG4gIG5vZGVJZDogc3RyaW5nO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuRGFnQ2FuY2VsLlxuICogVXNlIGBjcmVhdGUoRGFnQ2FuY2VsU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBEYWdDYW5jZWxTY2hlbWE6IEdlbk1lc3NhZ2U8RGFnQ2FuY2VsPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMzQpO1xuXG4vKipcbiAqIENsaWVudCBcdTIxOTIgU2VydmVyOiBBY2tub3dsZWRnZSBzdG9yeSBkaWFsb2d1ZVxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkRhZ1N0b3J5QWNrXG4gKi9cbmV4cG9ydCB0eXBlIERhZ1N0b3J5QWNrID0gTWVzc2FnZTxcImxpZ2h0c3BlZWRkdWVsLndzLkRhZ1N0b3J5QWNrXCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgbm9kZV9pZCA9IDE7XG4gICAqL1xuICBub2RlSWQ6IHN0cmluZztcblxuICAvKipcbiAgICogRW1wdHkgaWYganVzdCBjb250aW51ZSAobm8gY2hvaWNlKVxuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyBjaG9pY2VfaWQgPSAyO1xuICAgKi9cbiAgY2hvaWNlSWQ6IHN0cmluZztcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkRhZ1N0b3J5QWNrLlxuICogVXNlIGBjcmVhdGUoRGFnU3RvcnlBY2tTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IERhZ1N0b3J5QWNrU2NoZW1hOiBHZW5NZXNzYWdlPERhZ1N0b3J5QWNrPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMzUpO1xuXG4vKipcbiAqIENsaWVudCBcdTIxOTIgU2VydmVyOiBSZXF1ZXN0IGZ1bGwgREFHIGxpc3RcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5EYWdMaXN0XG4gKi9cbmV4cG9ydCB0eXBlIERhZ0xpc3QgPSBNZXNzYWdlPFwibGlnaHRzcGVlZGR1ZWwud3MuRGFnTGlzdFwiPiAmIHtcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkRhZ0xpc3QuXG4gKiBVc2UgYGNyZWF0ZShEYWdMaXN0U2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBEYWdMaXN0U2NoZW1hOiBHZW5NZXNzYWdlPERhZ0xpc3Q+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCAzNik7XG5cbi8qKlxuICogU2VydmVyIFx1MjE5MiBDbGllbnQ6IERBRyBsaXN0IHJlc3BvbnNlXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuRGFnTGlzdFJlc3BvbnNlXG4gKi9cbmV4cG9ydCB0eXBlIERhZ0xpc3RSZXNwb25zZSA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5EYWdMaXN0UmVzcG9uc2VcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLkRhZ1N0YXRlIGRhZyA9IDE7XG4gICAqL1xuICBkYWc/OiBEYWdTdGF0ZTtcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkRhZ0xpc3RSZXNwb25zZS5cbiAqIFVzZSBgY3JlYXRlKERhZ0xpc3RSZXNwb25zZVNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgRGFnTGlzdFJlc3BvbnNlU2NoZW1hOiBHZW5NZXNzYWdlPERhZ0xpc3RSZXNwb25zZT4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDM3KTtcblxuLyoqXG4gKiBJbnZlbnRvcnkgaXRlbVxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkludmVudG9yeUl0ZW1cbiAqL1xuZXhwb3J0IHR5cGUgSW52ZW50b3J5SXRlbSA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5JbnZlbnRvcnlJdGVtXCI+ICYge1xuICAvKipcbiAgICogXCJtaXNzaWxlXCIsIFwiY29tcG9uZW50XCIsIGV0Yy5cbiAgICpcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgdHlwZSA9IDE7XG4gICAqL1xuICB0eXBlOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIFNwZWNpZmljIHZhcmlhbnQgaWRlbnRpZmllclxuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyB2YXJpYW50X2lkID0gMjtcbiAgICovXG4gIHZhcmlhbnRJZDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBIZWF0IGNhcGFjaXR5IGZvciB0aGlzIGl0ZW1cbiAgICpcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgaGVhdF9jYXBhY2l0eSA9IDM7XG4gICAqL1xuICBoZWF0Q2FwYWNpdHk6IG51bWJlcjtcblxuICAvKipcbiAgICogU3RhY2sgcXVhbnRpdHlcbiAgICpcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBpbnQzMiBxdWFudGl0eSA9IDQ7XG4gICAqL1xuICBxdWFudGl0eTogbnVtYmVyO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuSW52ZW50b3J5SXRlbS5cbiAqIFVzZSBgY3JlYXRlKEludmVudG9yeUl0ZW1TY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IEludmVudG9yeUl0ZW1TY2hlbWE6IEdlbk1lc3NhZ2U8SW52ZW50b3J5SXRlbT4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDM4KTtcblxuLyoqXG4gKiBQbGF5ZXIgaW52ZW50b3J5XG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuSW52ZW50b3J5XG4gKi9cbmV4cG9ydCB0eXBlIEludmVudG9yeSA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5JbnZlbnRvcnlcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHJlcGVhdGVkIGxpZ2h0c3BlZWRkdWVsLndzLkludmVudG9yeUl0ZW0gaXRlbXMgPSAxO1xuICAgKi9cbiAgaXRlbXM6IEludmVudG9yeUl0ZW1bXTtcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLkludmVudG9yeS5cbiAqIFVzZSBgY3JlYXRlKEludmVudG9yeVNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgSW52ZW50b3J5U2NoZW1hOiBHZW5NZXNzYWdlPEludmVudG9yeT4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDM5KTtcblxuLyoqXG4gKiBTdG9yeSBkaWFsb2d1ZSBjaG9pY2Ugb3B0aW9uXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuU3RvcnlEaWFsb2d1ZUNob2ljZVxuICovXG5leHBvcnQgdHlwZSBTdG9yeURpYWxvZ3VlQ2hvaWNlID0gTWVzc2FnZTxcImxpZ2h0c3BlZWRkdWVsLndzLlN0b3J5RGlhbG9ndWVDaG9pY2VcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyBpZCA9IDE7XG4gICAqL1xuICBpZDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyB0ZXh0ID0gMjtcbiAgICovXG4gIHRleHQ6IHN0cmluZztcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLlN0b3J5RGlhbG9ndWVDaG9pY2UuXG4gKiBVc2UgYGNyZWF0ZShTdG9yeURpYWxvZ3VlQ2hvaWNlU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBTdG9yeURpYWxvZ3VlQ2hvaWNlU2NoZW1hOiBHZW5NZXNzYWdlPFN0b3J5RGlhbG9ndWVDaG9pY2U+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCA0MCk7XG5cbi8qKlxuICogU3RvcnkgdHV0b3JpYWwgdGlwXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuU3RvcnlUdXRvcmlhbFRpcFxuICovXG5leHBvcnQgdHlwZSBTdG9yeVR1dG9yaWFsVGlwID0gTWVzc2FnZTxcImxpZ2h0c3BlZWRkdWVsLndzLlN0b3J5VHV0b3JpYWxUaXBcIj4gJiB7XG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyB0aXRsZSA9IDE7XG4gICAqL1xuICB0aXRsZTogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHN0cmluZyB0ZXh0ID0gMjtcbiAgICovXG4gIHRleHQ6IHN0cmluZztcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLlN0b3J5VHV0b3JpYWxUaXAuXG4gKiBVc2UgYGNyZWF0ZShTdG9yeVR1dG9yaWFsVGlwU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBTdG9yeVR1dG9yaWFsVGlwU2NoZW1hOiBHZW5NZXNzYWdlPFN0b3J5VHV0b3JpYWxUaXA+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCA0MSk7XG5cbi8qKlxuICogU3RvcnkgZGlhbG9ndWUgY29udGVudFxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLlN0b3J5RGlhbG9ndWVcbiAqL1xuZXhwb3J0IHR5cGUgU3RvcnlEaWFsb2d1ZSA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5TdG9yeURpYWxvZ3VlXCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgc3BlYWtlciA9IDE7XG4gICAqL1xuICBzcGVha2VyOiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIHRleHQgPSAyO1xuICAgKi9cbiAgdGV4dDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGxpZ2h0c3BlZWRkdWVsLndzLlN0b3J5SW50ZW50IGludGVudCA9IDM7XG4gICAqL1xuICBpbnRlbnQ6IFN0b3J5SW50ZW50O1xuXG4gIC8qKlxuICAgKiBFbXB0eSA9IGRlZmF1bHQgXCJDb250aW51ZVwiXG4gICAqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIGNvbnRpbnVlX2xhYmVsID0gNDtcbiAgICovXG4gIGNvbnRpbnVlTGFiZWw6IHN0cmluZztcblxuICAvKipcbiAgICogRW1wdHkgPSBzaG93IGNvbnRpbnVlIGJ1dHRvblxuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHJlcGVhdGVkIGxpZ2h0c3BlZWRkdWVsLndzLlN0b3J5RGlhbG9ndWVDaG9pY2UgY2hvaWNlcyA9IDU7XG4gICAqL1xuICBjaG9pY2VzOiBTdG9yeURpYWxvZ3VlQ2hvaWNlW107XG5cbiAgLyoqXG4gICAqIE9wdGlvbmFsIGdhbWVwbGF5IGhpbnRcbiAgICpcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBvcHRpb25hbCBsaWdodHNwZWVkZHVlbC53cy5TdG9yeVR1dG9yaWFsVGlwIHR1dG9yaWFsX3RpcCA9IDY7XG4gICAqL1xuICB0dXRvcmlhbFRpcD86IFN0b3J5VHV0b3JpYWxUaXA7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5TdG9yeURpYWxvZ3VlLlxuICogVXNlIGBjcmVhdGUoU3RvcnlEaWFsb2d1ZVNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgU3RvcnlEaWFsb2d1ZVNjaGVtYTogR2VuTWVzc2FnZTxTdG9yeURpYWxvZ3VlPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgNDIpO1xuXG4vKipcbiAqIFN0b3J5IGV2ZW50IChoaXN0b3J5IGVudHJ5KVxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLlN0b3J5RXZlbnRcbiAqL1xuZXhwb3J0IHR5cGUgU3RvcnlFdmVudCA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5TdG9yeUV2ZW50XCI+ICYge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgY2hhcHRlcl9pZCA9IDE7XG4gICAqL1xuICBjaGFwdGVySWQ6IHN0cmluZztcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgbm9kZV9pZCA9IDI7XG4gICAqL1xuICBub2RlSWQ6IHN0cmluZztcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBkb3VibGUgdGltZXN0YW1wID0gMztcbiAgICovXG4gIHRpbWVzdGFtcDogbnVtYmVyO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuU3RvcnlFdmVudC5cbiAqIFVzZSBgY3JlYXRlKFN0b3J5RXZlbnRTY2hlbWEpYCB0byBjcmVhdGUgYSBuZXcgbWVzc2FnZS5cbiAqL1xuZXhwb3J0IGNvbnN0IFN0b3J5RXZlbnRTY2hlbWE6IEdlbk1lc3NhZ2U8U3RvcnlFdmVudD4gPSAvKkBfX1BVUkVfXyovXG4gIG1lc3NhZ2VEZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDQzKTtcblxuLyoqXG4gKiBTdG9yeSBzdGF0ZVxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLlN0b3J5U3RhdGVcbiAqL1xuZXhwb3J0IHR5cGUgU3RvcnlTdGF0ZSA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5TdG9yeVN0YXRlXCI+ICYge1xuICAvKipcbiAgICogQ3VycmVudGx5IGFjdGl2ZSBzdG9yeSBub2RlIElEXG4gICAqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogc3RyaW5nIGFjdGl2ZV9ub2RlID0gMTtcbiAgICovXG4gIGFjdGl2ZU5vZGU6IHN0cmluZztcblxuICAvKipcbiAgICogRnVsbCBkaWFsb2d1ZSBjb250ZW50XG4gICAqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogb3B0aW9uYWwgbGlnaHRzcGVlZGR1ZWwud3MuU3RvcnlEaWFsb2d1ZSBkaWFsb2d1ZSA9IDI7XG4gICAqL1xuICBkaWFsb2d1ZT86IFN0b3J5RGlhbG9ndWU7XG5cbiAgLyoqXG4gICAqIEF2YWlsYWJsZSBzdG9yeSBub2RlIElEc1xuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHJlcGVhdGVkIHN0cmluZyBhdmFpbGFibGUgPSAzO1xuICAgKi9cbiAgYXZhaWxhYmxlOiBzdHJpbmdbXTtcblxuICAvKipcbiAgICogU3RvcnkgZmxhZ3MgZm9yIGJyYW5jaGluZ1xuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IG1hcDxzdHJpbmcsIGJvb2w+IGZsYWdzID0gNDtcbiAgICovXG4gIGZsYWdzOiB7IFtrZXk6IHN0cmluZ106IGJvb2xlYW4gfTtcblxuICAvKipcbiAgICogUmVjZW50IHN0b3J5IGV2ZW50c1xuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IHJlcGVhdGVkIGxpZ2h0c3BlZWRkdWVsLndzLlN0b3J5RXZlbnQgcmVjZW50X2V2ZW50cyA9IDU7XG4gICAqL1xuICByZWNlbnRFdmVudHM6IFN0b3J5RXZlbnRbXTtcbn07XG5cbi8qKlxuICogRGVzY3JpYmVzIHRoZSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLlN0b3J5U3RhdGUuXG4gKiBVc2UgYGNyZWF0ZShTdG9yeVN0YXRlU2NoZW1hKWAgdG8gY3JlYXRlIGEgbmV3IG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBjb25zdCBTdG9yeVN0YXRlU2NoZW1hOiBHZW5NZXNzYWdlPFN0b3J5U3RhdGU+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCA0NCk7XG5cbi8qKlxuICogQ2xpZW50IFx1MjE5MiBTZXJ2ZXI6IFNwYXduIG1pc3Npb24gd2F2ZVxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBtZXNzYWdlIGxpZ2h0c3BlZWRkdWVsLndzLk1pc3Npb25TcGF3bldhdmVcbiAqL1xuZXhwb3J0IHR5cGUgTWlzc2lvblNwYXduV2F2ZSA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5NaXNzaW9uU3Bhd25XYXZlXCI+ICYge1xuICAvKipcbiAgICogMSwgMiwgb3IgM1xuICAgKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZmllbGQ6IGludDMyIHdhdmVfaW5kZXggPSAxO1xuICAgKi9cbiAgd2F2ZUluZGV4OiBudW1iZXI7XG59O1xuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5NaXNzaW9uU3Bhd25XYXZlLlxuICogVXNlIGBjcmVhdGUoTWlzc2lvblNwYXduV2F2ZVNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgTWlzc2lvblNwYXduV2F2ZVNjaGVtYTogR2VuTWVzc2FnZTxNaXNzaW9uU3Bhd25XYXZlPiA9IC8qQF9fUFVSRV9fKi9cbiAgbWVzc2FnZURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgNDUpO1xuXG4vKipcbiAqIENsaWVudCBcdTIxOTIgU2VydmVyOiBUcmlnZ2VyIG1pc3Npb24gc3RvcnkgZXZlbnRcbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gbWVzc2FnZSBsaWdodHNwZWVkZHVlbC53cy5NaXNzaW9uU3RvcnlFdmVudFxuICovXG5leHBvcnQgdHlwZSBNaXNzaW9uU3RvcnlFdmVudCA9IE1lc3NhZ2U8XCJsaWdodHNwZWVkZHVlbC53cy5NaXNzaW9uU3RvcnlFdmVudFwiPiAmIHtcbiAgLyoqXG4gICAqIGUuZy4gXCJtaXNzaW9uOnN0YXJ0XCIsIFwibWlzc2lvbjpiZWFjb24tbG9ja2VkXCJcbiAgICpcbiAgICogQGdlbmVyYXRlZCBmcm9tIGZpZWxkOiBzdHJpbmcgZXZlbnQgPSAxO1xuICAgKi9cbiAgZXZlbnQ6IHN0cmluZztcblxuICAvKipcbiAgICogQmVhY29uIGluZGV4IGZvciBiZWFjb24tc3BlY2lmaWMgZXZlbnRzXG4gICAqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBmaWVsZDogaW50MzIgYmVhY29uID0gMjtcbiAgICovXG4gIGJlYWNvbjogbnVtYmVyO1xufTtcblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIG1lc3NhZ2UgbGlnaHRzcGVlZGR1ZWwud3MuTWlzc2lvblN0b3J5RXZlbnQuXG4gKiBVc2UgYGNyZWF0ZShNaXNzaW9uU3RvcnlFdmVudFNjaGVtYSlgIHRvIGNyZWF0ZSBhIG5ldyBtZXNzYWdlLlxuICovXG5leHBvcnQgY29uc3QgTWlzc2lvblN0b3J5RXZlbnRTY2hlbWE6IEdlbk1lc3NhZ2U8TWlzc2lvblN0b3J5RXZlbnQ+ID0gLypAX19QVVJFX18qL1xuICBtZXNzYWdlRGVzYyhmaWxlX3Byb3RvX3dzX21lc3NhZ2VzLCA0Nik7XG5cbi8qKlxuICogREFHIG5vZGUgc3RhdHVzIGVudW1cbiAqXG4gKiBAZ2VuZXJhdGVkIGZyb20gZW51bSBsaWdodHNwZWVkZHVlbC53cy5EYWdOb2RlU3RhdHVzXG4gKi9cbmV4cG9ydCBlbnVtIERhZ05vZGVTdGF0dXMge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IERBR19OT0RFX1NUQVRVU19VTlNQRUNJRklFRCA9IDA7XG4gICAqL1xuICBVTlNQRUNJRklFRCA9IDAsXG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBEQUdfTk9ERV9TVEFUVVNfTE9DS0VEID0gMTtcbiAgICovXG4gIExPQ0tFRCA9IDEsXG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBEQUdfTk9ERV9TVEFUVVNfQVZBSUxBQkxFID0gMjtcbiAgICovXG4gIEFWQUlMQUJMRSA9IDIsXG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBEQUdfTk9ERV9TVEFUVVNfSU5fUFJPR1JFU1MgPSAzO1xuICAgKi9cbiAgSU5fUFJPR1JFU1MgPSAzLFxuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogREFHX05PREVfU1RBVFVTX0NPTVBMRVRFRCA9IDQ7XG4gICAqL1xuICBDT01QTEVURUQgPSA0LFxufVxuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgZW51bSBsaWdodHNwZWVkZHVlbC53cy5EYWdOb2RlU3RhdHVzLlxuICovXG5leHBvcnQgY29uc3QgRGFnTm9kZVN0YXR1c1NjaGVtYTogR2VuRW51bTxEYWdOb2RlU3RhdHVzPiA9IC8qQF9fUFVSRV9fKi9cbiAgZW51bURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMCk7XG5cbi8qKlxuICogREFHIG5vZGUga2luZCBlbnVtXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIGVudW0gbGlnaHRzcGVlZGR1ZWwud3MuRGFnTm9kZUtpbmRcbiAqL1xuZXhwb3J0IGVudW0gRGFnTm9kZUtpbmQge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IERBR19OT0RFX0tJTkRfVU5TUEVDSUZJRUQgPSAwO1xuICAgKi9cbiAgVU5TUEVDSUZJRUQgPSAwLFxuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogREFHX05PREVfS0lORF9GQUNUT1JZID0gMTtcbiAgICovXG4gIEZBQ1RPUlkgPSAxLFxuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogREFHX05PREVfS0lORF9VTklUID0gMjtcbiAgICovXG4gIFVOSVQgPSAyLFxuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogREFHX05PREVfS0lORF9TVE9SWSA9IDM7XG4gICAqL1xuICBTVE9SWSA9IDMsXG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBEQUdfTk9ERV9LSU5EX0NSQUZUID0gNDtcbiAgICovXG4gIENSQUZUID0gNCxcbn1cblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIGVudW0gbGlnaHRzcGVlZGR1ZWwud3MuRGFnTm9kZUtpbmQuXG4gKi9cbmV4cG9ydCBjb25zdCBEYWdOb2RlS2luZFNjaGVtYTogR2VuRW51bTxEYWdOb2RlS2luZD4gPSAvKkBfX1BVUkVfXyovXG4gIGVudW1EZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDEpO1xuXG4vKipcbiAqIFVwZ3JhZGUgZWZmZWN0IHR5cGUgZW51bVxuICpcbiAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIGxpZ2h0c3BlZWRkdWVsLndzLlVwZ3JhZGVFZmZlY3RUeXBlXG4gKi9cbmV4cG9ydCBlbnVtIFVwZ3JhZGVFZmZlY3RUeXBlIHtcbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBVUEdSQURFX0VGRkVDVF9UWVBFX1VOU1BFQ0lGSUVEID0gMDtcbiAgICovXG4gIFVOU1BFQ0lGSUVEID0gMCxcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFVQR1JBREVfRUZGRUNUX1RZUEVfU1BFRURfTVVMVElQTElFUiA9IDE7XG4gICAqL1xuICBTUEVFRF9NVUxUSVBMSUVSID0gMSxcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFVQR1JBREVfRUZGRUNUX1RZUEVfTUlTU0lMRV9VTkxPQ0sgPSAyO1xuICAgKi9cbiAgTUlTU0lMRV9VTkxPQ0sgPSAyLFxuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVVBHUkFERV9FRkZFQ1RfVFlQRV9IRUFUX0NBUEFDSVRZID0gMztcbiAgICovXG4gIEhFQVRfQ0FQQUNJVFkgPSAzLFxuXG4gIC8qKlxuICAgKiBAZ2VuZXJhdGVkIGZyb20gZW51bSB2YWx1ZTogVVBHUkFERV9FRkZFQ1RfVFlQRV9IRUFUX0VGRklDSUVOQ1kgPSA0O1xuICAgKi9cbiAgSEVBVF9FRkZJQ0lFTkNZID0gNCxcbn1cblxuLyoqXG4gKiBEZXNjcmliZXMgdGhlIGVudW0gbGlnaHRzcGVlZGR1ZWwud3MuVXBncmFkZUVmZmVjdFR5cGUuXG4gKi9cbmV4cG9ydCBjb25zdCBVcGdyYWRlRWZmZWN0VHlwZVNjaGVtYTogR2VuRW51bTxVcGdyYWRlRWZmZWN0VHlwZT4gPSAvKkBfX1BVUkVfXyovXG4gIGVudW1EZXNjKGZpbGVfcHJvdG9fd3NfbWVzc2FnZXMsIDIpO1xuXG4vKipcbiAqIFN0b3J5IGludGVudCBlbnVtXG4gKlxuICogQGdlbmVyYXRlZCBmcm9tIGVudW0gbGlnaHRzcGVlZGR1ZWwud3MuU3RvcnlJbnRlbnRcbiAqL1xuZXhwb3J0IGVudW0gU3RvcnlJbnRlbnQge1xuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFNUT1JZX0lOVEVOVF9VTlNQRUNJRklFRCA9IDA7XG4gICAqL1xuICBVTlNQRUNJRklFRCA9IDAsXG5cbiAgLyoqXG4gICAqIEBnZW5lcmF0ZWQgZnJvbSBlbnVtIHZhbHVlOiBTVE9SWV9JTlRFTlRfRkFDVE9SWSA9IDE7XG4gICAqL1xuICBGQUNUT1JZID0gMSxcblxuICAvKipcbiAgICogQGdlbmVyYXRlZCBmcm9tIGVudW0gdmFsdWU6IFNUT1JZX0lOVEVOVF9VTklUID0gMjtcbiAgICovXG4gIFVOSVQgPSAyLFxufVxuXG4vKipcbiAqIERlc2NyaWJlcyB0aGUgZW51bSBsaWdodHNwZWVkZHVlbC53cy5TdG9yeUludGVudC5cbiAqL1xuZXhwb3J0IGNvbnN0IFN0b3J5SW50ZW50U2NoZW1hOiBHZW5FbnVtPFN0b3J5SW50ZW50PiA9IC8qQF9fUFVSRV9fKi9cbiAgZW51bURlc2MoZmlsZV9wcm90b193c19tZXNzYWdlcywgMyk7XG5cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuZXhwb3J0IHt9O1xuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5pbXBvcnQgeyBzY2FsYXJFcXVhbHMgfSBmcm9tIFwiLi9yZWZsZWN0L3NjYWxhci5qc1wiO1xuaW1wb3J0IHsgcmVmbGVjdCB9IGZyb20gXCIuL3JlZmxlY3QvcmVmbGVjdC5qc1wiO1xuaW1wb3J0IHsgU2NhbGFyVHlwZSwgfSBmcm9tIFwiLi9kZXNjcmlwdG9ycy5qc1wiO1xuaW1wb3J0IHsgYW55VW5wYWNrIH0gZnJvbSBcIi4vd2t0L2luZGV4LmpzXCI7XG5pbXBvcnQgeyBjcmVhdGVFeHRlbnNpb25Db250YWluZXIsIGdldEV4dGVuc2lvbiB9IGZyb20gXCIuL2V4dGVuc2lvbnMuanNcIjtcbi8qKlxuICogQ29tcGFyZSB0d28gbWVzc2FnZXMgb2YgdGhlIHNhbWUgdHlwZS5cbiAqXG4gKiBOb3RlIHRoYXQgdGhpcyBmdW5jdGlvbiBkaXNyZWdhcmRzIGV4dGVuc2lvbnMgYW5kIHVua25vd24gZmllbGRzLCBhbmQgdGhhdFxuICogTmFOIGlzIG5vdCBlcXVhbCBOYU4sIGZvbGxvd2luZyB0aGUgSUVFRSBzdGFuZGFyZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVxdWFscyhzY2hlbWEsIGEsIGIsIG9wdGlvbnMpIHtcbiAgICBpZiAoYS4kdHlwZU5hbWUgIT0gc2NoZW1hLnR5cGVOYW1lIHx8IGIuJHR5cGVOYW1lICE9IHNjaGVtYS50eXBlTmFtZSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGlmIChhID09PSBiKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gcmVmbGVjdEVxdWFscyhyZWZsZWN0KHNjaGVtYSwgYSksIHJlZmxlY3Qoc2NoZW1hLCBiKSwgb3B0aW9ucyk7XG59XG5mdW5jdGlvbiByZWZsZWN0RXF1YWxzKGEsIGIsIG9wdHMpIHtcbiAgICBpZiAoYS5kZXNjLnR5cGVOYW1lID09PSBcImdvb2dsZS5wcm90b2J1Zi5BbnlcIiAmJiAob3B0cyA9PT0gbnVsbCB8fCBvcHRzID09PSB2b2lkIDAgPyB2b2lkIDAgOiBvcHRzLnVucGFja0FueSkgPT0gdHJ1ZSkge1xuICAgICAgICByZXR1cm4gYW55VW5wYWNrZWRFcXVhbHMoYS5tZXNzYWdlLCBiLm1lc3NhZ2UsIG9wdHMpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGYgb2YgYS5maWVsZHMpIHtcbiAgICAgICAgaWYgKCFmaWVsZEVxdWFscyhmLCBhLCBiLCBvcHRzKSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmICgob3B0cyA9PT0gbnVsbCB8fCBvcHRzID09PSB2b2lkIDAgPyB2b2lkIDAgOiBvcHRzLnVua25vd24pID09IHRydWUgJiYgIXVua25vd25FcXVhbHMoYSwgYiwgb3B0cy5yZWdpc3RyeSkpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoKG9wdHMgPT09IG51bGwgfHwgb3B0cyA9PT0gdm9pZCAwID8gdm9pZCAwIDogb3B0cy5leHRlbnNpb25zKSA9PSB0cnVlICYmICFleHRlbnNpb25zRXF1YWxzKGEsIGIsIG9wdHMpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59XG4vLyBUT0RPKHRzdGFtbSkgYWRkIGFuIG9wdGlvbiB0byBjb25zaWRlciBOYU4gZXF1YWwgdG8gTmFOP1xuZnVuY3Rpb24gZmllbGRFcXVhbHMoZiwgYSwgYiwgb3B0cykge1xuICAgIGlmICghYS5pc1NldChmKSAmJiAhYi5pc1NldChmKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgaWYgKCFhLmlzU2V0KGYpIHx8ICFiLmlzU2V0KGYpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgc3dpdGNoIChmLmZpZWxkS2luZCkge1xuICAgICAgICBjYXNlIFwic2NhbGFyXCI6XG4gICAgICAgICAgICByZXR1cm4gc2NhbGFyRXF1YWxzKGYuc2NhbGFyLCBhLmdldChmKSwgYi5nZXQoZikpO1xuICAgICAgICBjYXNlIFwiZW51bVwiOlxuICAgICAgICAgICAgcmV0dXJuIGEuZ2V0KGYpID09PSBiLmdldChmKTtcbiAgICAgICAgY2FzZSBcIm1lc3NhZ2VcIjpcbiAgICAgICAgICAgIHJldHVybiByZWZsZWN0RXF1YWxzKGEuZ2V0KGYpLCBiLmdldChmKSwgb3B0cyk7XG4gICAgICAgIGNhc2UgXCJtYXBcIjoge1xuICAgICAgICAgICAgLy8gVE9ETyh0c3RhbW0pIGNhbid0IHdlIGNvbXBhcmUgc2l6ZXMgZmlyc3Q/XG4gICAgICAgICAgICBjb25zdCBtYXBBID0gYS5nZXQoZik7XG4gICAgICAgICAgICBjb25zdCBtYXBCID0gYi5nZXQoZik7XG4gICAgICAgICAgICBjb25zdCBrZXlzID0gW107XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGsgb2YgbWFwQS5rZXlzKCkpIHtcbiAgICAgICAgICAgICAgICBpZiAoIW1hcEIuaGFzKGspKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAga2V5cy5wdXNoKGspO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChjb25zdCBrIG9mIG1hcEIua2V5cygpKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFtYXBBLmhhcyhrKSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHZhID0gbWFwQS5nZXQoa2V5KTtcbiAgICAgICAgICAgICAgICBjb25zdCB2YiA9IG1hcEIuZ2V0KGtleSk7XG4gICAgICAgICAgICAgICAgaWYgKHZhID09PSB2Yikge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc3dpdGNoIChmLm1hcEtpbmQpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcImVudW1cIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcIm1lc3NhZ2VcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcmVmbGVjdEVxdWFscyh2YSwgdmIsIG9wdHMpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJzY2FsYXJcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc2NhbGFyRXF1YWxzKGYuc2NhbGFyLCB2YSwgdmIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBcImxpc3RcIjoge1xuICAgICAgICAgICAgY29uc3QgbGlzdEEgPSBhLmdldChmKTtcbiAgICAgICAgICAgIGNvbnN0IGxpc3RCID0gYi5nZXQoZik7XG4gICAgICAgICAgICBpZiAobGlzdEEuc2l6ZSAhPSBsaXN0Qi5zaXplKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsaXN0QS5zaXplOyBpKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCB2YSA9IGxpc3RBLmdldChpKTtcbiAgICAgICAgICAgICAgICBjb25zdCB2YiA9IGxpc3RCLmdldChpKTtcbiAgICAgICAgICAgICAgICBpZiAodmEgPT09IHZiKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzd2l0Y2ggKGYubGlzdEtpbmQpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcImVudW1cIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcIm1lc3NhZ2VcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcmVmbGVjdEVxdWFscyh2YSwgdmIsIG9wdHMpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJzY2FsYXJcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghc2NhbGFyRXF1YWxzKGYuc2NhbGFyLCB2YSwgdmIpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59XG5mdW5jdGlvbiBhbnlVbnBhY2tlZEVxdWFscyhhLCBiLCBvcHRzKSB7XG4gICAgaWYgKGEudHlwZVVybCAhPT0gYi50eXBlVXJsKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgY29uc3QgdW5wYWNrZWRBID0gYW55VW5wYWNrKGEsIG9wdHMucmVnaXN0cnkpO1xuICAgIGNvbnN0IHVucGFja2VkQiA9IGFueVVucGFjayhiLCBvcHRzLnJlZ2lzdHJ5KTtcbiAgICBpZiAodW5wYWNrZWRBICYmIHVucGFja2VkQikge1xuICAgICAgICBjb25zdCBzY2hlbWEgPSBvcHRzLnJlZ2lzdHJ5LmdldE1lc3NhZ2UodW5wYWNrZWRBLiR0eXBlTmFtZSk7XG4gICAgICAgIGlmIChzY2hlbWEpIHtcbiAgICAgICAgICAgIHJldHVybiBlcXVhbHMoc2NoZW1hLCB1bnBhY2tlZEEsIHVucGFja2VkQiwgb3B0cyk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHNjYWxhckVxdWFscyhTY2FsYXJUeXBlLkJZVEVTLCBhLnZhbHVlLCBiLnZhbHVlKTtcbn1cbmZ1bmN0aW9uIHVua25vd25FcXVhbHMoYSwgYiwgcmVnaXN0cnkpIHtcbiAgICBmdW5jdGlvbiBnZXRUcnVseVVua25vd24obXNnLCByZWdpc3RyeSkge1xuICAgICAgICB2YXIgX2E7XG4gICAgICAgIGNvbnN0IHUgPSAoX2EgPSBtc2cuZ2V0VW5rbm93bigpKSAhPT0gbnVsbCAmJiBfYSAhPT0gdm9pZCAwID8gX2EgOiBbXTtcbiAgICAgICAgcmV0dXJuIHJlZ2lzdHJ5XG4gICAgICAgICAgICA/IHUuZmlsdGVyKCh1ZikgPT4gIXJlZ2lzdHJ5LmdldEV4dGVuc2lvbkZvcihtc2cuZGVzYywgdWYubm8pKVxuICAgICAgICAgICAgOiB1O1xuICAgIH1cbiAgICBjb25zdCB1bmtub3duQSA9IGdldFRydWx5VW5rbm93bihhLCByZWdpc3RyeSk7XG4gICAgY29uc3QgdW5rbm93bkIgPSBnZXRUcnVseVVua25vd24oYiwgcmVnaXN0cnkpO1xuICAgIGlmICh1bmtub3duQS5sZW5ndGggIT0gdW5rbm93bkIubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB1bmtub3duQS5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCBhID0gdW5rbm93bkFbaV07XG4gICAgICAgIGNvbnN0IGIgPSB1bmtub3duQltpXTtcbiAgICAgICAgaWYgKGEubm8gIT0gYi5ubykge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChhLndpcmVUeXBlICE9IGIud2lyZVR5cGUpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXNjYWxhckVxdWFscyhTY2FsYXJUeXBlLkJZVEVTLCBhLmRhdGEsIGIuZGF0YSkpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbn1cbmZ1bmN0aW9uIGV4dGVuc2lvbnNFcXVhbHMoYSwgYiwgb3B0cykge1xuICAgIGZ1bmN0aW9uIGdldFNldEV4dGVuc2lvbnMobXNnLCByZWdpc3RyeSkge1xuICAgICAgICB2YXIgX2E7XG4gICAgICAgIHJldHVybiAoKF9hID0gbXNnLmdldFVua25vd24oKSkgIT09IG51bGwgJiYgX2EgIT09IHZvaWQgMCA/IF9hIDogW10pXG4gICAgICAgICAgICAubWFwKCh1ZikgPT4gcmVnaXN0cnkuZ2V0RXh0ZW5zaW9uRm9yKG1zZy5kZXNjLCB1Zi5ubykpXG4gICAgICAgICAgICAuZmlsdGVyKChlKSA9PiBlICE9IHVuZGVmaW5lZClcbiAgICAgICAgICAgIC5maWx0ZXIoKGUsIGluZGV4LCBhcnIpID0+IGFyci5pbmRleE9mKGUpID09PSBpbmRleCk7XG4gICAgfVxuICAgIGNvbnN0IGV4dGVuc2lvbnNBID0gZ2V0U2V0RXh0ZW5zaW9ucyhhLCBvcHRzLnJlZ2lzdHJ5KTtcbiAgICBjb25zdCBleHRlbnNpb25zQiA9IGdldFNldEV4dGVuc2lvbnMoYiwgb3B0cy5yZWdpc3RyeSk7XG4gICAgaWYgKGV4dGVuc2lvbnNBLmxlbmd0aCAhPSBleHRlbnNpb25zQi5sZW5ndGggfHxcbiAgICAgICAgZXh0ZW5zaW9uc0Euc29tZSgoZSkgPT4gIWV4dGVuc2lvbnNCLmluY2x1ZGVzKGUpKSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnNBKSB7XG4gICAgICAgIGNvbnN0IFtjb250YWluZXJBLCBmaWVsZF0gPSBjcmVhdGVFeHRlbnNpb25Db250YWluZXIoZXh0ZW5zaW9uLCBnZXRFeHRlbnNpb24oYS5tZXNzYWdlLCBleHRlbnNpb24pKTtcbiAgICAgICAgY29uc3QgW2NvbnRhaW5lckJdID0gY3JlYXRlRXh0ZW5zaW9uQ29udGFpbmVyKGV4dGVuc2lvbiwgZ2V0RXh0ZW5zaW9uKGIubWVzc2FnZSwgZXh0ZW5zaW9uKSk7XG4gICAgICAgIGlmICghZmllbGRFcXVhbHMoZmllbGQsIGNvbnRhaW5lckEsIGNvbnRhaW5lckIsIG9wdHMpKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59XG4iLCAiLy8gQ29weXJpZ2h0IDIwMjEtMjAyNSBCdWYgVGVjaG5vbG9naWVzLCBJbmMuXG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4vL1xuLy8gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuLy8gZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuLy8gV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4vLyBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4vLyBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbmltcG9ydCB7IFNjYWxhclR5cGUsIH0gZnJvbSBcIi4vZGVzY3JpcHRvcnMuanNcIjtcbmltcG9ydCB7IHByb3RvQ2FtZWxDYXNlIH0gZnJvbSBcIi4vcmVmbGVjdC9uYW1lcy5qc1wiO1xuaW1wb3J0IHsgcmVmbGVjdCB9IGZyb20gXCIuL3JlZmxlY3QvcmVmbGVjdC5qc1wiO1xuaW1wb3J0IHsgYW55VW5wYWNrIH0gZnJvbSBcIi4vd2t0L2luZGV4LmpzXCI7XG5pbXBvcnQgeyBpc1dyYXBwZXJEZXNjIH0gZnJvbSBcIi4vd2t0L3dyYXBwZXJzLmpzXCI7XG5pbXBvcnQgeyBiYXNlNjRFbmNvZGUgfSBmcm9tIFwiLi93aXJlL2luZGV4LmpzXCI7XG5pbXBvcnQgeyBjcmVhdGVFeHRlbnNpb25Db250YWluZXIsIGdldEV4dGVuc2lvbiB9IGZyb20gXCIuL2V4dGVuc2lvbnMuanNcIjtcbmltcG9ydCB7IGNoZWNrRmllbGQsIGZvcm1hdFZhbCB9IGZyb20gXCIuL3JlZmxlY3QvcmVmbGVjdC1jaGVjay5qc1wiO1xuLy8gYm9vdHN0cmFwLWluamVjdCBnb29nbGUucHJvdG9idWYuRmVhdHVyZVNldC5GaWVsZFByZXNlbmNlLkxFR0FDWV9SRVFVSVJFRDogY29uc3QgJG5hbWU6IEZlYXR1cmVTZXRfRmllbGRQcmVzZW5jZS4kbG9jYWxOYW1lID0gJG51bWJlcjtcbmNvbnN0IExFR0FDWV9SRVFVSVJFRCA9IDM7XG4vLyBib290c3RyYXAtaW5qZWN0IGdvb2dsZS5wcm90b2J1Zi5GZWF0dXJlU2V0LkZpZWxkUHJlc2VuY2UuSU1QTElDSVQ6IGNvbnN0ICRuYW1lOiBGZWF0dXJlU2V0X0ZpZWxkUHJlc2VuY2UuJGxvY2FsTmFtZSA9ICRudW1iZXI7XG5jb25zdCBJTVBMSUNJVCA9IDI7XG4vLyBEZWZhdWx0IG9wdGlvbnMgZm9yIHNlcmlhbGl6aW5nIHRvIEpTT04uXG5jb25zdCBqc29uV3JpdGVEZWZhdWx0cyA9IHtcbiAgICBhbHdheXNFbWl0SW1wbGljaXQ6IGZhbHNlLFxuICAgIGVudW1Bc0ludGVnZXI6IGZhbHNlLFxuICAgIHVzZVByb3RvRmllbGROYW1lOiBmYWxzZSxcbn07XG5mdW5jdGlvbiBtYWtlV3JpdGVPcHRpb25zKG9wdGlvbnMpIHtcbiAgICByZXR1cm4gb3B0aW9ucyA/IE9iamVjdC5hc3NpZ24oT2JqZWN0LmFzc2lnbih7fSwganNvbldyaXRlRGVmYXVsdHMpLCBvcHRpb25zKSA6IGpzb25Xcml0ZURlZmF1bHRzO1xufVxuLyoqXG4gKiBTZXJpYWxpemUgdGhlIG1lc3NhZ2UgdG8gYSBKU09OIHZhbHVlLCBhIEphdmFTY3JpcHQgdmFsdWUgdGhhdCBjYW4gYmVcbiAqIHBhc3NlZCB0byBKU09OLnN0cmluZ2lmeSgpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9Kc29uKHNjaGVtYSwgbWVzc2FnZSwgb3B0aW9ucykge1xuICAgIHJldHVybiByZWZsZWN0VG9Kc29uKHJlZmxlY3Qoc2NoZW1hLCBtZXNzYWdlKSwgbWFrZVdyaXRlT3B0aW9ucyhvcHRpb25zKSk7XG59XG4vKipcbiAqIFNlcmlhbGl6ZSB0aGUgbWVzc2FnZSB0byBhIEpTT04gc3RyaW5nLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9Kc29uU3RyaW5nKHNjaGVtYSwgbWVzc2FnZSwgb3B0aW9ucykge1xuICAgIHZhciBfYTtcbiAgICBjb25zdCBqc29uVmFsdWUgPSB0b0pzb24oc2NoZW1hLCBtZXNzYWdlLCBvcHRpb25zKTtcbiAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoanNvblZhbHVlLCBudWxsLCAoX2EgPSBvcHRpb25zID09PSBudWxsIHx8IG9wdGlvbnMgPT09IHZvaWQgMCA/IHZvaWQgMCA6IG9wdGlvbnMucHJldHR5U3BhY2VzKSAhPT0gbnVsbCAmJiBfYSAhPT0gdm9pZCAwID8gX2EgOiAwKTtcbn1cbi8qKlxuICogU2VyaWFsaXplIGEgc2luZ2xlIGVudW0gdmFsdWUgdG8gSlNPTi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGVudW1Ub0pzb24oZGVzY0VudW0sIHZhbHVlKSB7XG4gICAgdmFyIF9hO1xuICAgIGlmIChkZXNjRW51bS50eXBlTmFtZSA9PSBcImdvb2dsZS5wcm90b2J1Zi5OdWxsVmFsdWVcIikge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgY29uc3QgbmFtZSA9IChfYSA9IGRlc2NFbnVtLnZhbHVlW3ZhbHVlXSkgPT09IG51bGwgfHwgX2EgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9hLm5hbWU7XG4gICAgaWYgKG5hbWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7dmFsdWV9IGlzIG5vdCBhIHZhbHVlIGluICR7ZGVzY0VudW19YCk7XG4gICAgfVxuICAgIHJldHVybiBuYW1lO1xufVxuZnVuY3Rpb24gcmVmbGVjdFRvSnNvbihtc2csIG9wdHMpIHtcbiAgICB2YXIgX2E7XG4gICAgY29uc3Qgd2t0SnNvbiA9IHRyeVdrdFRvSnNvbihtc2csIG9wdHMpO1xuICAgIGlmICh3a3RKc29uICE9PSB1bmRlZmluZWQpXG4gICAgICAgIHJldHVybiB3a3RKc29uO1xuICAgIGNvbnN0IGpzb24gPSB7fTtcbiAgICBmb3IgKGNvbnN0IGYgb2YgbXNnLnNvcnRlZEZpZWxkcykge1xuICAgICAgICBpZiAoIW1zZy5pc1NldChmKSkge1xuICAgICAgICAgICAgaWYgKGYucHJlc2VuY2UgPT0gTEVHQUNZX1JFUVVJUkVEKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZW5jb2RlICR7Zn0gdG8gSlNPTjogcmVxdWlyZWQgZmllbGQgbm90IHNldGApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFvcHRzLmFsd2F5c0VtaXRJbXBsaWNpdCB8fCBmLnByZXNlbmNlICE9PSBJTVBMSUNJVCkge1xuICAgICAgICAgICAgICAgIC8vIEZpZWxkcyB3aXRoIGltcGxpY2l0IHByZXNlbmNlIG9taXQgemVybyB2YWx1ZXMgKGUuZy4gZW1wdHkgc3RyaW5nKSBieSBkZWZhdWx0XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QganNvblZhbHVlID0gZmllbGRUb0pzb24oZiwgbXNnLmdldChmKSwgb3B0cyk7XG4gICAgICAgIGlmIChqc29uVmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAganNvbltqc29uTmFtZShmLCBvcHRzKV0gPSBqc29uVmFsdWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKG9wdHMucmVnaXN0cnkpIHtcbiAgICAgICAgY29uc3QgdGFnU2VlbiA9IG5ldyBTZXQoKTtcbiAgICAgICAgZm9yIChjb25zdCB7IG5vIH0gb2YgKF9hID0gbXNnLmdldFVua25vd24oKSkgIT09IG51bGwgJiYgX2EgIT09IHZvaWQgMCA/IF9hIDogW10pIHtcbiAgICAgICAgICAgIC8vIFNhbWUgdGFnIGNhbiBhcHBlYXIgbXVsdGlwbGUgdGltZXMsIHNvIHdlXG4gICAgICAgICAgICAvLyBrZWVwIHRyYWNrIGFuZCBza2lwIGlkZW50aWNhbCBvbmVzLlxuICAgICAgICAgICAgaWYgKCF0YWdTZWVuLmhhcyhubykpIHtcbiAgICAgICAgICAgICAgICB0YWdTZWVuLmFkZChubyk7XG4gICAgICAgICAgICAgICAgY29uc3QgZXh0ZW5zaW9uID0gb3B0cy5yZWdpc3RyeS5nZXRFeHRlbnNpb25Gb3IobXNnLmRlc2MsIG5vKTtcbiAgICAgICAgICAgICAgICBpZiAoIWV4dGVuc2lvbikge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBnZXRFeHRlbnNpb24obXNnLm1lc3NhZ2UsIGV4dGVuc2lvbik7XG4gICAgICAgICAgICAgICAgY29uc3QgW2NvbnRhaW5lciwgZmllbGRdID0gY3JlYXRlRXh0ZW5zaW9uQ29udGFpbmVyKGV4dGVuc2lvbiwgdmFsdWUpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGpzb25WYWx1ZSA9IGZpZWxkVG9Kc29uKGZpZWxkLCBjb250YWluZXIuZ2V0KGZpZWxkKSwgb3B0cyk7XG4gICAgICAgICAgICAgICAgaWYgKGpzb25WYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGpzb25bZXh0ZW5zaW9uLmpzb25OYW1lXSA9IGpzb25WYWx1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGpzb247XG59XG5mdW5jdGlvbiBmaWVsZFRvSnNvbihmLCB2YWwsIG9wdHMpIHtcbiAgICBzd2l0Y2ggKGYuZmllbGRLaW5kKSB7XG4gICAgICAgIGNhc2UgXCJzY2FsYXJcIjpcbiAgICAgICAgICAgIHJldHVybiBzY2FsYXJUb0pzb24oZiwgdmFsKTtcbiAgICAgICAgY2FzZSBcIm1lc3NhZ2VcIjpcbiAgICAgICAgICAgIHJldHVybiByZWZsZWN0VG9Kc29uKHZhbCwgb3B0cyk7XG4gICAgICAgIGNhc2UgXCJlbnVtXCI6XG4gICAgICAgICAgICByZXR1cm4gZW51bVRvSnNvbkludGVybmFsKGYuZW51bSwgdmFsLCBvcHRzLmVudW1Bc0ludGVnZXIpO1xuICAgICAgICBjYXNlIFwibGlzdFwiOlxuICAgICAgICAgICAgcmV0dXJuIGxpc3RUb0pzb24odmFsLCBvcHRzKTtcbiAgICAgICAgY2FzZSBcIm1hcFwiOlxuICAgICAgICAgICAgcmV0dXJuIG1hcFRvSnNvbih2YWwsIG9wdHMpO1xuICAgIH1cbn1cbmZ1bmN0aW9uIG1hcFRvSnNvbihtYXAsIG9wdHMpIHtcbiAgICBjb25zdCBmID0gbWFwLmZpZWxkKCk7XG4gICAgY29uc3QganNvbk9iaiA9IHt9O1xuICAgIHN3aXRjaCAoZi5tYXBLaW5kKSB7XG4gICAgICAgIGNhc2UgXCJzY2FsYXJcIjpcbiAgICAgICAgICAgIGZvciAoY29uc3QgW2VudHJ5S2V5LCBlbnRyeVZhbHVlXSBvZiBtYXApIHtcbiAgICAgICAgICAgICAgICBqc29uT2JqW2VudHJ5S2V5XSA9IHNjYWxhclRvSnNvbihmLCBlbnRyeVZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwibWVzc2FnZVwiOlxuICAgICAgICAgICAgZm9yIChjb25zdCBbZW50cnlLZXksIGVudHJ5VmFsdWVdIG9mIG1hcCkge1xuICAgICAgICAgICAgICAgIGpzb25PYmpbZW50cnlLZXldID0gcmVmbGVjdFRvSnNvbihlbnRyeVZhbHVlLCBvcHRzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiZW51bVwiOlxuICAgICAgICAgICAgZm9yIChjb25zdCBbZW50cnlLZXksIGVudHJ5VmFsdWVdIG9mIG1hcCkge1xuICAgICAgICAgICAgICAgIGpzb25PYmpbZW50cnlLZXldID0gZW51bVRvSnNvbkludGVybmFsKGYuZW51bSwgZW50cnlWYWx1ZSwgb3B0cy5lbnVtQXNJbnRlZ2VyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4gb3B0cy5hbHdheXNFbWl0SW1wbGljaXQgfHwgbWFwLnNpemUgPiAwID8ganNvbk9iaiA6IHVuZGVmaW5lZDtcbn1cbmZ1bmN0aW9uIGxpc3RUb0pzb24obGlzdCwgb3B0cykge1xuICAgIGNvbnN0IGYgPSBsaXN0LmZpZWxkKCk7XG4gICAgY29uc3QganNvbkFyciA9IFtdO1xuICAgIHN3aXRjaCAoZi5saXN0S2luZCkge1xuICAgICAgICBjYXNlIFwic2NhbGFyXCI6XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgbGlzdCkge1xuICAgICAgICAgICAgICAgIGpzb25BcnIucHVzaChzY2FsYXJUb0pzb24oZiwgaXRlbSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJlbnVtXCI6XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgbGlzdCkge1xuICAgICAgICAgICAgICAgIGpzb25BcnIucHVzaChlbnVtVG9Kc29uSW50ZXJuYWwoZi5lbnVtLCBpdGVtLCBvcHRzLmVudW1Bc0ludGVnZXIpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwibWVzc2FnZVwiOlxuICAgICAgICAgICAgZm9yIChjb25zdCBpdGVtIG9mIGxpc3QpIHtcbiAgICAgICAgICAgICAgICBqc29uQXJyLnB1c2gocmVmbGVjdFRvSnNvbihpdGVtLCBvcHRzKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIG9wdHMuYWx3YXlzRW1pdEltcGxpY2l0IHx8IGpzb25BcnIubGVuZ3RoID4gMCA/IGpzb25BcnIgOiB1bmRlZmluZWQ7XG59XG5mdW5jdGlvbiBlbnVtVG9Kc29uSW50ZXJuYWwoZGVzYywgdmFsdWUsIGVudW1Bc0ludGVnZXIpIHtcbiAgICB2YXIgX2E7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSAhPSBcIm51bWJlclwiKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGVuY29kZSAke2Rlc2N9IHRvIEpTT046IGV4cGVjdGVkIG51bWJlciwgZ290ICR7Zm9ybWF0VmFsKHZhbHVlKX1gKTtcbiAgICB9XG4gICAgaWYgKGRlc2MudHlwZU5hbWUgPT0gXCJnb29nbGUucHJvdG9idWYuTnVsbFZhbHVlXCIpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGlmIChlbnVtQXNJbnRlZ2VyKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG4gICAgY29uc3QgdmFsID0gZGVzYy52YWx1ZVt2YWx1ZV07XG4gICAgcmV0dXJuIChfYSA9IHZhbCA9PT0gbnVsbCB8fCB2YWwgPT09IHZvaWQgMCA/IHZvaWQgMCA6IHZhbC5uYW1lKSAhPT0gbnVsbCAmJiBfYSAhPT0gdm9pZCAwID8gX2EgOiB2YWx1ZTsgLy8gaWYgd2UgZG9uJ3Qga25vdyB0aGUgZW51bSB2YWx1ZSwganVzdCByZXR1cm4gdGhlIG51bWJlclxufVxuZnVuY3Rpb24gc2NhbGFyVG9Kc29uKGZpZWxkLCB2YWx1ZSkge1xuICAgIHZhciBfYSwgX2IsIF9jLCBfZCwgX2UsIF9mO1xuICAgIHN3aXRjaCAoZmllbGQuc2NhbGFyKSB7XG4gICAgICAgIC8vIGludDMyLCBmaXhlZDMyLCB1aW50MzI6IEpTT04gdmFsdWUgd2lsbCBiZSBhIGRlY2ltYWwgbnVtYmVyLiBFaXRoZXIgbnVtYmVycyBvciBzdHJpbmdzIGFyZSBhY2NlcHRlZC5cbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLklOVDMyOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0ZJWEVEMzI6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TSU5UMzI6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5GSVhFRDMyOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuVUlOVDMyOlxuICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPSBcIm51bWJlclwiKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZW5jb2RlICR7ZmllbGR9IHRvIEpTT046ICR7KF9hID0gY2hlY2tGaWVsZChmaWVsZCwgdmFsdWUpKSA9PT0gbnVsbCB8fCBfYSA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2EubWVzc2FnZX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgLy8gZmxvYXQsIGRvdWJsZTogSlNPTiB2YWx1ZSB3aWxsIGJlIGEgbnVtYmVyIG9yIG9uZSBvZiB0aGUgc3BlY2lhbCBzdHJpbmcgdmFsdWVzIFwiTmFOXCIsIFwiSW5maW5pdHlcIiwgYW5kIFwiLUluZmluaXR5XCIuXG4gICAgICAgIC8vIEVpdGhlciBudW1iZXJzIG9yIHN0cmluZ3MgYXJlIGFjY2VwdGVkLiBFeHBvbmVudCBub3RhdGlvbiBpcyBhbHNvIGFjY2VwdGVkLlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRkxPQVQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5ET1VCTEU6IC8vIGVzbGludC1kaXNhYmxlLWxpbmUgbm8tZmFsbHRocm91Z2hcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgIT0gXCJudW1iZXJcIikge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGVuY29kZSAke2ZpZWxkfSB0byBKU09OOiAkeyhfYiA9IGNoZWNrRmllbGQoZmllbGQsIHZhbHVlKSkgPT09IG51bGwgfHwgX2IgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9iLm1lc3NhZ2V9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoTnVtYmVyLmlzTmFOKHZhbHVlKSlcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJOYU5cIjtcbiAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZKVxuICAgICAgICAgICAgICAgIHJldHVybiBcIkluZmluaXR5XCI7XG4gICAgICAgICAgICBpZiAodmFsdWUgPT09IE51bWJlci5ORUdBVElWRV9JTkZJTklUWSlcbiAgICAgICAgICAgICAgICByZXR1cm4gXCItSW5maW5pdHlcIjtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgLy8gc3RyaW5nOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU1RSSU5HOlxuICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZW5jb2RlICR7ZmllbGR9IHRvIEpTT046ICR7KF9jID0gY2hlY2tGaWVsZChmaWVsZCwgdmFsdWUpKSA9PT0gbnVsbCB8fCBfYyA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2MubWVzc2FnZX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgLy8gYm9vbDpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkJPT0w6XG4gICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlICE9IFwiYm9vbGVhblwiKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZW5jb2RlICR7ZmllbGR9IHRvIEpTT046ICR7KF9kID0gY2hlY2tGaWVsZChmaWVsZCwgdmFsdWUpKSA9PT0gbnVsbCB8fCBfZCA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2QubWVzc2FnZX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgLy8gSlNPTiB2YWx1ZSB3aWxsIGJlIGEgZGVjaW1hbCBzdHJpbmcuIEVpdGhlciBudW1iZXJzIG9yIHN0cmluZ3MgYXJlIGFjY2VwdGVkLlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuVUlOVDY0OlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRklYRUQ2NDpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLklOVDY0OlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0ZJWEVENjQ6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TSU5UNjQ6XG4gICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlICE9IFwiYmlnaW50XCIgJiYgdHlwZW9mIHZhbHVlICE9IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGNhbm5vdCBlbmNvZGUgJHtmaWVsZH0gdG8gSlNPTjogJHsoX2UgPSBjaGVja0ZpZWxkKGZpZWxkLCB2YWx1ZSkpID09PSBudWxsIHx8IF9lID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfZS5tZXNzYWdlfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlLnRvU3RyaW5nKCk7XG4gICAgICAgIC8vIGJ5dGVzOiBKU09OIHZhbHVlIHdpbGwgYmUgdGhlIGRhdGEgZW5jb2RlZCBhcyBhIHN0cmluZyB1c2luZyBzdGFuZGFyZCBiYXNlNjQgZW5jb2Rpbmcgd2l0aCBwYWRkaW5ncy5cbiAgICAgICAgLy8gRWl0aGVyIHN0YW5kYXJkIG9yIFVSTC1zYWZlIGJhc2U2NCBlbmNvZGluZyB3aXRoL3dpdGhvdXQgcGFkZGluZ3MgYXJlIGFjY2VwdGVkLlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuQllURVM6XG4gICAgICAgICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBVaW50OEFycmF5KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGJhc2U2NEVuY29kZSh2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGNhbm5vdCBlbmNvZGUgJHtmaWVsZH0gdG8gSlNPTjogJHsoX2YgPSBjaGVja0ZpZWxkKGZpZWxkLCB2YWx1ZSkpID09PSBudWxsIHx8IF9mID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfZi5tZXNzYWdlfWApO1xuICAgIH1cbn1cbmZ1bmN0aW9uIGpzb25OYW1lKGYsIG9wdHMpIHtcbiAgICByZXR1cm4gb3B0cy51c2VQcm90b0ZpZWxkTmFtZSA/IGYubmFtZSA6IGYuanNvbk5hbWU7XG59XG4vLyByZXR1cm5zIGEganNvbiB2YWx1ZSBpZiB3a3QsIG90aGVyd2lzZSByZXR1cm5zIHVuZGVmaW5lZC5cbmZ1bmN0aW9uIHRyeVdrdFRvSnNvbihtc2csIG9wdHMpIHtcbiAgICBpZiAoIW1zZy5kZXNjLnR5cGVOYW1lLnN0YXJ0c1dpdGgoXCJnb29nbGUucHJvdG9idWYuXCIpKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHN3aXRjaCAobXNnLmRlc2MudHlwZU5hbWUpIHtcbiAgICAgICAgY2FzZSBcImdvb2dsZS5wcm90b2J1Zi5BbnlcIjpcbiAgICAgICAgICAgIHJldHVybiBhbnlUb0pzb24obXNnLm1lc3NhZ2UsIG9wdHMpO1xuICAgICAgICBjYXNlIFwiZ29vZ2xlLnByb3RvYnVmLlRpbWVzdGFtcFwiOlxuICAgICAgICAgICAgcmV0dXJuIHRpbWVzdGFtcFRvSnNvbihtc2cubWVzc2FnZSk7XG4gICAgICAgIGNhc2UgXCJnb29nbGUucHJvdG9idWYuRHVyYXRpb25cIjpcbiAgICAgICAgICAgIHJldHVybiBkdXJhdGlvblRvSnNvbihtc2cubWVzc2FnZSk7XG4gICAgICAgIGNhc2UgXCJnb29nbGUucHJvdG9idWYuRmllbGRNYXNrXCI6XG4gICAgICAgICAgICByZXR1cm4gZmllbGRNYXNrVG9Kc29uKG1zZy5tZXNzYWdlKTtcbiAgICAgICAgY2FzZSBcImdvb2dsZS5wcm90b2J1Zi5TdHJ1Y3RcIjpcbiAgICAgICAgICAgIHJldHVybiBzdHJ1Y3RUb0pzb24obXNnLm1lc3NhZ2UpO1xuICAgICAgICBjYXNlIFwiZ29vZ2xlLnByb3RvYnVmLlZhbHVlXCI6XG4gICAgICAgICAgICByZXR1cm4gdmFsdWVUb0pzb24obXNnLm1lc3NhZ2UpO1xuICAgICAgICBjYXNlIFwiZ29vZ2xlLnByb3RvYnVmLkxpc3RWYWx1ZVwiOlxuICAgICAgICAgICAgcmV0dXJuIGxpc3RWYWx1ZVRvSnNvbihtc2cubWVzc2FnZSk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBpZiAoaXNXcmFwcGVyRGVzYyhtc2cuZGVzYykpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB2YWx1ZUZpZWxkID0gbXNnLmRlc2MuZmllbGRzWzBdO1xuICAgICAgICAgICAgICAgIHJldHVybiBzY2FsYXJUb0pzb24odmFsdWVGaWVsZCwgbXNnLmdldCh2YWx1ZUZpZWxkKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbn1cbmZ1bmN0aW9uIGFueVRvSnNvbih2YWwsIG9wdHMpIHtcbiAgICBpZiAodmFsLnR5cGVVcmwgPT09IFwiXCIpIHtcbiAgICAgICAgcmV0dXJuIHt9O1xuICAgIH1cbiAgICBjb25zdCB7IHJlZ2lzdHJ5IH0gPSBvcHRzO1xuICAgIGxldCBtZXNzYWdlO1xuICAgIGxldCBkZXNjO1xuICAgIGlmIChyZWdpc3RyeSkge1xuICAgICAgICBtZXNzYWdlID0gYW55VW5wYWNrKHZhbCwgcmVnaXN0cnkpO1xuICAgICAgICBpZiAobWVzc2FnZSkge1xuICAgICAgICAgICAgZGVzYyA9IHJlZ2lzdHJ5LmdldE1lc3NhZ2UobWVzc2FnZS4kdHlwZU5hbWUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmICghZGVzYyB8fCAhbWVzc2FnZSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGNhbm5vdCBlbmNvZGUgbWVzc2FnZSAke3ZhbC4kdHlwZU5hbWV9IHRvIEpTT046IFwiJHt2YWwudHlwZVVybH1cIiBpcyBub3QgaW4gdGhlIHR5cGUgcmVnaXN0cnlgKTtcbiAgICB9XG4gICAgbGV0IGpzb24gPSByZWZsZWN0VG9Kc29uKHJlZmxlY3QoZGVzYywgbWVzc2FnZSksIG9wdHMpO1xuICAgIGlmIChkZXNjLnR5cGVOYW1lLnN0YXJ0c1dpdGgoXCJnb29nbGUucHJvdG9idWYuXCIpIHx8XG4gICAgICAgIGpzb24gPT09IG51bGwgfHxcbiAgICAgICAgQXJyYXkuaXNBcnJheShqc29uKSB8fFxuICAgICAgICB0eXBlb2YganNvbiAhPT0gXCJvYmplY3RcIikge1xuICAgICAgICBqc29uID0geyB2YWx1ZToganNvbiB9O1xuICAgIH1cbiAgICBqc29uW1wiQHR5cGVcIl0gPSB2YWwudHlwZVVybDtcbiAgICByZXR1cm4ganNvbjtcbn1cbmZ1bmN0aW9uIGR1cmF0aW9uVG9Kc29uKHZhbCkge1xuICAgIGlmIChOdW1iZXIodmFsLnNlY29uZHMpID4gMzE1NTc2MDAwMDAwIHx8XG4gICAgICAgIE51bWJlcih2YWwuc2Vjb25kcykgPCAtMzE1NTc2MDAwMDAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGVuY29kZSBtZXNzYWdlICR7dmFsLiR0eXBlTmFtZX0gdG8gSlNPTjogdmFsdWUgb3V0IG9mIHJhbmdlYCk7XG4gICAgfVxuICAgIGxldCB0ZXh0ID0gdmFsLnNlY29uZHMudG9TdHJpbmcoKTtcbiAgICBpZiAodmFsLm5hbm9zICE9PSAwKSB7XG4gICAgICAgIGxldCBuYW5vc1N0ciA9IE1hdGguYWJzKHZhbC5uYW5vcykudG9TdHJpbmcoKTtcbiAgICAgICAgbmFub3NTdHIgPSBcIjBcIi5yZXBlYXQoOSAtIG5hbm9zU3RyLmxlbmd0aCkgKyBuYW5vc1N0cjtcbiAgICAgICAgaWYgKG5hbm9zU3RyLnN1YnN0cmluZygzKSA9PT0gXCIwMDAwMDBcIikge1xuICAgICAgICAgICAgbmFub3NTdHIgPSBuYW5vc1N0ci5zdWJzdHJpbmcoMCwgMyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAobmFub3NTdHIuc3Vic3RyaW5nKDYpID09PSBcIjAwMFwiKSB7XG4gICAgICAgICAgICBuYW5vc1N0ciA9IG5hbm9zU3RyLnN1YnN0cmluZygwLCA2KTtcbiAgICAgICAgfVxuICAgICAgICB0ZXh0ICs9IFwiLlwiICsgbmFub3NTdHI7XG4gICAgICAgIGlmICh2YWwubmFub3MgPCAwICYmIE51bWJlcih2YWwuc2Vjb25kcykgPT0gMCkge1xuICAgICAgICAgICAgdGV4dCA9IFwiLVwiICsgdGV4dDtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGV4dCArIFwic1wiO1xufVxuZnVuY3Rpb24gZmllbGRNYXNrVG9Kc29uKHZhbCkge1xuICAgIHJldHVybiB2YWwucGF0aHNcbiAgICAgICAgLm1hcCgocCkgPT4ge1xuICAgICAgICBpZiAocC5tYXRjaCgvX1swLTldP18vZykgfHwgcC5tYXRjaCgvW0EtWl0vZykpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGVuY29kZSBtZXNzYWdlICR7dmFsLiR0eXBlTmFtZX0gdG8gSlNPTjogbG93ZXJDYW1lbENhc2Ugb2YgcGF0aCBuYW1lIFwiYCArXG4gICAgICAgICAgICAgICAgcCArXG4gICAgICAgICAgICAgICAgJ1wiIGlzIGlycmV2ZXJzaWJsZScpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBwcm90b0NhbWVsQ2FzZShwKTtcbiAgICB9KVxuICAgICAgICAuam9pbihcIixcIik7XG59XG5mdW5jdGlvbiBzdHJ1Y3RUb0pzb24odmFsKSB7XG4gICAgY29uc3QganNvbiA9IHt9O1xuICAgIGZvciAoY29uc3QgW2ssIHZdIG9mIE9iamVjdC5lbnRyaWVzKHZhbC5maWVsZHMpKSB7XG4gICAgICAgIGpzb25ba10gPSB2YWx1ZVRvSnNvbih2KTtcbiAgICB9XG4gICAgcmV0dXJuIGpzb247XG59XG5mdW5jdGlvbiB2YWx1ZVRvSnNvbih2YWwpIHtcbiAgICBzd2l0Y2ggKHZhbC5raW5kLmNhc2UpIHtcbiAgICAgICAgY2FzZSBcIm51bGxWYWx1ZVwiOlxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIGNhc2UgXCJudW1iZXJWYWx1ZVwiOlxuICAgICAgICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUodmFsLmtpbmQudmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke3ZhbC4kdHlwZU5hbWV9IGNhbm5vdCBiZSBOYU4gb3IgSW5maW5pdHlgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB2YWwua2luZC52YWx1ZTtcbiAgICAgICAgY2FzZSBcImJvb2xWYWx1ZVwiOlxuICAgICAgICAgICAgcmV0dXJuIHZhbC5raW5kLnZhbHVlO1xuICAgICAgICBjYXNlIFwic3RyaW5nVmFsdWVcIjpcbiAgICAgICAgICAgIHJldHVybiB2YWwua2luZC52YWx1ZTtcbiAgICAgICAgY2FzZSBcInN0cnVjdFZhbHVlXCI6XG4gICAgICAgICAgICByZXR1cm4gc3RydWN0VG9Kc29uKHZhbC5raW5kLnZhbHVlKTtcbiAgICAgICAgY2FzZSBcImxpc3RWYWx1ZVwiOlxuICAgICAgICAgICAgcmV0dXJuIGxpc3RWYWx1ZVRvSnNvbih2YWwua2luZC52YWx1ZSk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7dmFsLiR0eXBlTmFtZX0gbXVzdCBoYXZlIGEgdmFsdWVgKTtcbiAgICB9XG59XG5mdW5jdGlvbiBsaXN0VmFsdWVUb0pzb24odmFsKSB7XG4gICAgcmV0dXJuIHZhbC52YWx1ZXMubWFwKHZhbHVlVG9Kc29uKTtcbn1cbmZ1bmN0aW9uIHRpbWVzdGFtcFRvSnNvbih2YWwpIHtcbiAgICBjb25zdCBtcyA9IE51bWJlcih2YWwuc2Vjb25kcykgKiAxMDAwO1xuICAgIGlmIChtcyA8IERhdGUucGFyc2UoXCIwMDAxLTAxLTAxVDAwOjAwOjAwWlwiKSB8fFxuICAgICAgICBtcyA+IERhdGUucGFyc2UoXCI5OTk5LTEyLTMxVDIzOjU5OjU5WlwiKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGNhbm5vdCBlbmNvZGUgbWVzc2FnZSAke3ZhbC4kdHlwZU5hbWV9IHRvIEpTT046IG11c3QgYmUgZnJvbSAwMDAxLTAxLTAxVDAwOjAwOjAwWiB0byA5OTk5LTEyLTMxVDIzOjU5OjU5WiBpbmNsdXNpdmVgKTtcbiAgICB9XG4gICAgaWYgKHZhbC5uYW5vcyA8IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZW5jb2RlIG1lc3NhZ2UgJHt2YWwuJHR5cGVOYW1lfSB0byBKU09OOiBuYW5vcyBtdXN0IG5vdCBiZSBuZWdhdGl2ZWApO1xuICAgIH1cbiAgICBsZXQgeiA9IFwiWlwiO1xuICAgIGlmICh2YWwubmFub3MgPiAwKSB7XG4gICAgICAgIGNvbnN0IG5hbm9zU3RyID0gKHZhbC5uYW5vcyArIDEwMDAwMDAwMDApLnRvU3RyaW5nKCkuc3Vic3RyaW5nKDEpO1xuICAgICAgICBpZiAobmFub3NTdHIuc3Vic3RyaW5nKDMpID09PSBcIjAwMDAwMFwiKSB7XG4gICAgICAgICAgICB6ID0gXCIuXCIgKyBuYW5vc1N0ci5zdWJzdHJpbmcoMCwgMykgKyBcIlpcIjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChuYW5vc1N0ci5zdWJzdHJpbmcoNikgPT09IFwiMDAwXCIpIHtcbiAgICAgICAgICAgIHogPSBcIi5cIiArIG5hbm9zU3RyLnN1YnN0cmluZygwLCA2KSArIFwiWlwiO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgeiA9IFwiLlwiICsgbmFub3NTdHIgKyBcIlpcIjtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbmV3IERhdGUobXMpLnRvSVNPU3RyaW5nKCkucmVwbGFjZShcIi4wMDBaXCIsIHopO1xufVxuIiwgIi8vIENvcHlyaWdodCAyMDIxLTIwMjUgQnVmIFRlY2hub2xvZ2llcywgSW5jLlxuLy9cbi8vIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4vLyB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4vLyBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbi8vXG4vLyAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5pbXBvcnQgeyBTY2FsYXJUeXBlLCB9IGZyb20gXCIuL2Rlc2NyaXB0b3JzLmpzXCI7XG5pbXBvcnQgeyBwcm90b0ludDY0IH0gZnJvbSBcIi4vcHJvdG8taW50NjQuanNcIjtcbmltcG9ydCB7IGNyZWF0ZSB9IGZyb20gXCIuL2NyZWF0ZS5qc1wiO1xuaW1wb3J0IHsgcmVmbGVjdCB9IGZyb20gXCIuL3JlZmxlY3QvcmVmbGVjdC5qc1wiO1xuaW1wb3J0IHsgRmllbGRFcnJvciwgaXNGaWVsZEVycm9yIH0gZnJvbSBcIi4vcmVmbGVjdC9lcnJvci5qc1wiO1xuaW1wb3J0IHsgZm9ybWF0VmFsIH0gZnJvbSBcIi4vcmVmbGVjdC9yZWZsZWN0LWNoZWNrLmpzXCI7XG5pbXBvcnQgeyBzY2FsYXJaZXJvVmFsdWUgfSBmcm9tIFwiLi9yZWZsZWN0L3NjYWxhci5qc1wiO1xuaW1wb3J0IHsgYmFzZTY0RGVjb2RlIH0gZnJvbSBcIi4vd2lyZS9iYXNlNjQtZW5jb2RpbmcuanNcIjtcbmltcG9ydCB7IGlzV3JhcHBlckRlc2MsIGFueVBhY2ssIExpc3RWYWx1ZVNjaGVtYSwgTnVsbFZhbHVlLCBTdHJ1Y3RTY2hlbWEsIFZhbHVlU2NoZW1hLCB9IGZyb20gXCIuL3drdC9pbmRleC5qc1wiO1xuaW1wb3J0IHsgY3JlYXRlRXh0ZW5zaW9uQ29udGFpbmVyLCBzZXRFeHRlbnNpb24gfSBmcm9tIFwiLi9leHRlbnNpb25zLmpzXCI7XG4vLyBEZWZhdWx0IG9wdGlvbnMgZm9yIHBhcnNpbmcgSlNPTi5cbmNvbnN0IGpzb25SZWFkRGVmYXVsdHMgPSB7XG4gICAgaWdub3JlVW5rbm93bkZpZWxkczogZmFsc2UsXG59O1xuZnVuY3Rpb24gbWFrZVJlYWRPcHRpb25zKG9wdGlvbnMpIHtcbiAgICByZXR1cm4gb3B0aW9ucyA/IE9iamVjdC5hc3NpZ24oT2JqZWN0LmFzc2lnbih7fSwganNvblJlYWREZWZhdWx0cyksIG9wdGlvbnMpIDoganNvblJlYWREZWZhdWx0cztcbn1cbi8qKlxuICogUGFyc2UgYSBtZXNzYWdlIGZyb20gYSBKU09OIHN0cmluZy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZyb21Kc29uU3RyaW5nKHNjaGVtYSwganNvbiwgb3B0aW9ucykge1xuICAgIHJldHVybiBmcm9tSnNvbihzY2hlbWEsIHBhcnNlSnNvblN0cmluZyhqc29uLCBzY2hlbWEudHlwZU5hbWUpLCBvcHRpb25zKTtcbn1cbi8qKlxuICogUGFyc2UgYSBtZXNzYWdlIGZyb20gYSBKU09OIHN0cmluZywgbWVyZ2luZyBmaWVsZHMuXG4gKlxuICogUmVwZWF0ZWQgZmllbGRzIGFyZSBhcHBlbmRlZC4gTWFwIGVudHJpZXMgYXJlIGFkZGVkLCBvdmVyd3JpdGluZ1xuICogZXhpc3Rpbmcga2V5cy5cbiAqXG4gKiBJZiBhIG1lc3NhZ2UgZmllbGQgaXMgYWxyZWFkeSBwcmVzZW50LCBpdCB3aWxsIGJlIG1lcmdlZCB3aXRoIHRoZVxuICogbmV3IGRhdGEuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZUZyb21Kc29uU3RyaW5nKHNjaGVtYSwgdGFyZ2V0LCBqc29uLCBvcHRpb25zKSB7XG4gICAgcmV0dXJuIG1lcmdlRnJvbUpzb24oc2NoZW1hLCB0YXJnZXQsIHBhcnNlSnNvblN0cmluZyhqc29uLCBzY2hlbWEudHlwZU5hbWUpLCBvcHRpb25zKTtcbn1cbi8qKlxuICogUGFyc2UgYSBtZXNzYWdlIGZyb20gYSBKU09OIHZhbHVlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZnJvbUpzb24oc2NoZW1hLCBqc29uLCBvcHRpb25zKSB7XG4gICAgY29uc3QgbXNnID0gcmVmbGVjdChzY2hlbWEpO1xuICAgIHRyeSB7XG4gICAgICAgIHJlYWRNZXNzYWdlKG1zZywganNvbiwgbWFrZVJlYWRPcHRpb25zKG9wdGlvbnMpKTtcbiAgICB9XG4gICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgaWYgKGlzRmllbGRFcnJvcihlKSkge1xuICAgICAgICAgICAgLy8gQHRzLWV4cGVjdC1lcnJvciB3ZSB1c2UgdGhlIEVTMjAyMiBlcnJvciBDVE9SIG9wdGlvbiBcImNhdXNlXCIgZm9yIGJldHRlciBzdGFjayB0cmFjZXNcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGRlY29kZSAke2UuZmllbGQoKX0gZnJvbSBKU09OOiAke2UubWVzc2FnZX1gLCB7XG4gICAgICAgICAgICAgICAgY2F1c2U6IGUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlO1xuICAgIH1cbiAgICByZXR1cm4gbXNnLm1lc3NhZ2U7XG59XG4vKipcbiAqIFBhcnNlIGEgbWVzc2FnZSBmcm9tIGEgSlNPTiB2YWx1ZSwgbWVyZ2luZyBmaWVsZHMuXG4gKlxuICogUmVwZWF0ZWQgZmllbGRzIGFyZSBhcHBlbmRlZC4gTWFwIGVudHJpZXMgYXJlIGFkZGVkLCBvdmVyd3JpdGluZ1xuICogZXhpc3Rpbmcga2V5cy5cbiAqXG4gKiBJZiBhIG1lc3NhZ2UgZmllbGQgaXMgYWxyZWFkeSBwcmVzZW50LCBpdCB3aWxsIGJlIG1lcmdlZCB3aXRoIHRoZVxuICogbmV3IGRhdGEuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZUZyb21Kc29uKHNjaGVtYSwgdGFyZ2V0LCBqc29uLCBvcHRpb25zKSB7XG4gICAgdHJ5IHtcbiAgICAgICAgcmVhZE1lc3NhZ2UocmVmbGVjdChzY2hlbWEsIHRhcmdldCksIGpzb24sIG1ha2VSZWFkT3B0aW9ucyhvcHRpb25zKSk7XG4gICAgfVxuICAgIGNhdGNoIChlKSB7XG4gICAgICAgIGlmIChpc0ZpZWxkRXJyb3IoZSkpIHtcbiAgICAgICAgICAgIC8vIEB0cy1leHBlY3QtZXJyb3Igd2UgdXNlIHRoZSBFUzIwMjIgZXJyb3IgQ1RPUiBvcHRpb24gXCJjYXVzZVwiIGZvciBiZXR0ZXIgc3RhY2sgdHJhY2VzXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGNhbm5vdCBkZWNvZGUgJHtlLmZpZWxkKCl9IGZyb20gSlNPTjogJHtlLm1lc3NhZ2V9YCwge1xuICAgICAgICAgICAgICAgIGNhdXNlOiBlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZTtcbiAgICB9XG4gICAgcmV0dXJuIHRhcmdldDtcbn1cbi8qKlxuICogUGFyc2VzIGFuIGVudW0gdmFsdWUgZnJvbSBKU09OLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZW51bUZyb21Kc29uKGRlc2NFbnVtLCBqc29uKSB7XG4gICAgY29uc3QgdmFsID0gcmVhZEVudW0oZGVzY0VudW0sIGpzb24sIGZhbHNlLCBmYWxzZSk7XG4gICAgaWYgKHZhbCA9PT0gdG9rZW5JZ25vcmVkVW5rbm93bkVudW0pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZGVjb2RlICR7ZGVzY0VudW19IGZyb20gSlNPTjogJHtmb3JtYXRWYWwoanNvbil9YCk7XG4gICAgfVxuICAgIHJldHVybiB2YWw7XG59XG4vKipcbiAqIElzIHRoZSBnaXZlbiB2YWx1ZSBhIEpTT04gZW51bSB2YWx1ZT9cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzRW51bUpzb24oZGVzY0VudW0sIHZhbHVlKSB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZCAhPT0gZGVzY0VudW0udmFsdWVzLmZpbmQoKHYpID0+IHYubmFtZSA9PT0gdmFsdWUpO1xufVxuZnVuY3Rpb24gcmVhZE1lc3NhZ2UobXNnLCBqc29uLCBvcHRzKSB7XG4gICAgdmFyIF9hO1xuICAgIGlmICh0cnlXa3RGcm9tSnNvbihtc2csIGpzb24sIG9wdHMpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGpzb24gPT0gbnVsbCB8fCBBcnJheS5pc0FycmF5KGpzb24pIHx8IHR5cGVvZiBqc29uICE9IFwib2JqZWN0XCIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZGVjb2RlICR7bXNnLmRlc2N9IGZyb20gSlNPTjogJHtmb3JtYXRWYWwoanNvbil9YCk7XG4gICAgfVxuICAgIGNvbnN0IG9uZW9mU2VlbiA9IG5ldyBNYXAoKTtcbiAgICBjb25zdCBqc29uTmFtZXMgPSBuZXcgTWFwKCk7XG4gICAgZm9yIChjb25zdCBmaWVsZCBvZiBtc2cuZGVzYy5maWVsZHMpIHtcbiAgICAgICAganNvbk5hbWVzLnNldChmaWVsZC5uYW1lLCBmaWVsZCkuc2V0KGZpZWxkLmpzb25OYW1lLCBmaWVsZCk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgW2pzb25LZXksIGpzb25WYWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoanNvbikpIHtcbiAgICAgICAgY29uc3QgZmllbGQgPSBqc29uTmFtZXMuZ2V0KGpzb25LZXkpO1xuICAgICAgICBpZiAoZmllbGQpIHtcbiAgICAgICAgICAgIGlmIChmaWVsZC5vbmVvZikge1xuICAgICAgICAgICAgICAgIGlmIChqc29uVmFsdWUgPT09IG51bGwgJiYgZmllbGQuZmllbGRLaW5kID09IFwic2NhbGFyXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gc2VlIGNvbmZvcm1hbmNlIHRlc3QgUmVxdWlyZWQuUHJvdG8zLkpzb25JbnB1dC5PbmVvZkZpZWxkTnVsbHtGaXJzdCxTZWNvbmR9XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBzZWVuID0gb25lb2ZTZWVuLmdldChmaWVsZC5vbmVvZik7XG4gICAgICAgICAgICAgICAgaWYgKHNlZW4gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRmllbGRFcnJvcihmaWVsZC5vbmVvZiwgYG9uZW9mIHNldCBtdWx0aXBsZSB0aW1lcyBieSAke3NlZW4ubmFtZX0gYW5kICR7ZmllbGQubmFtZX1gKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgb25lb2ZTZWVuLnNldChmaWVsZC5vbmVvZiwgZmllbGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVhZEZpZWxkKG1zZywgZmllbGQsIGpzb25WYWx1ZSwgb3B0cyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBsZXQgZXh0ZW5zaW9uID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgaWYgKGpzb25LZXkuc3RhcnRzV2l0aChcIltcIikgJiZcbiAgICAgICAgICAgICAgICBqc29uS2V5LmVuZHNXaXRoKFwiXVwiKSAmJlxuICAgICAgICAgICAgICAgIC8vIGJpb21lLWlnbm9yZSBsaW50L3N1c3BpY2lvdXMvbm9Bc3NpZ25JbkV4cHJlc3Npb25zOiBub1xuICAgICAgICAgICAgICAgIChleHRlbnNpb24gPSAoX2EgPSBvcHRzLnJlZ2lzdHJ5KSA9PT0gbnVsbCB8fCBfYSA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2EuZ2V0RXh0ZW5zaW9uKGpzb25LZXkuc3Vic3RyaW5nKDEsIGpzb25LZXkubGVuZ3RoIC0gMSkpKSAmJlxuICAgICAgICAgICAgICAgIGV4dGVuc2lvbi5leHRlbmRlZS50eXBlTmFtZSA9PT0gbXNnLmRlc2MudHlwZU5hbWUpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBbY29udGFpbmVyLCBmaWVsZCwgZ2V0XSA9IGNyZWF0ZUV4dGVuc2lvbkNvbnRhaW5lcihleHRlbnNpb24pO1xuICAgICAgICAgICAgICAgIHJlYWRGaWVsZChjb250YWluZXIsIGZpZWxkLCBqc29uVmFsdWUsIG9wdHMpO1xuICAgICAgICAgICAgICAgIHNldEV4dGVuc2lvbihtc2cubWVzc2FnZSwgZXh0ZW5zaW9uLCBnZXQoKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIWV4dGVuc2lvbiAmJiAhb3B0cy5pZ25vcmVVbmtub3duRmllbGRzKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZGVjb2RlICR7bXNnLmRlc2N9IGZyb20gSlNPTjoga2V5IFwiJHtqc29uS2V5fVwiIGlzIHVua25vd25gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cbmZ1bmN0aW9uIHJlYWRGaWVsZChtc2csIGZpZWxkLCBqc29uLCBvcHRzKSB7XG4gICAgc3dpdGNoIChmaWVsZC5maWVsZEtpbmQpIHtcbiAgICAgICAgY2FzZSBcInNjYWxhclwiOlxuICAgICAgICAgICAgcmVhZFNjYWxhckZpZWxkKG1zZywgZmllbGQsIGpzb24pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJlbnVtXCI6XG4gICAgICAgICAgICByZWFkRW51bUZpZWxkKG1zZywgZmllbGQsIGpzb24sIG9wdHMpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJtZXNzYWdlXCI6XG4gICAgICAgICAgICByZWFkTWVzc2FnZUZpZWxkKG1zZywgZmllbGQsIGpzb24sIG9wdHMpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJsaXN0XCI6XG4gICAgICAgICAgICByZWFkTGlzdEZpZWxkKG1zZy5nZXQoZmllbGQpLCBqc29uLCBvcHRzKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwibWFwXCI6XG4gICAgICAgICAgICByZWFkTWFwRmllbGQobXNnLmdldChmaWVsZCksIGpzb24sIG9wdHMpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxufVxuZnVuY3Rpb24gcmVhZE1hcEZpZWxkKG1hcCwganNvbiwgb3B0cykge1xuICAgIGlmIChqc29uID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgZmllbGQgPSBtYXAuZmllbGQoKTtcbiAgICBpZiAodHlwZW9mIGpzb24gIT0gXCJvYmplY3RcIiB8fCBBcnJheS5pc0FycmF5KGpzb24pKSB7XG4gICAgICAgIHRocm93IG5ldyBGaWVsZEVycm9yKGZpZWxkLCBcImV4cGVjdGVkIG9iamVjdCwgZ290IFwiICsgZm9ybWF0VmFsKGpzb24pKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBbanNvbk1hcEtleSwganNvbk1hcFZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhqc29uKSkge1xuICAgICAgICBpZiAoanNvbk1hcFZhbHVlID09PSBudWxsKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRmllbGRFcnJvcihmaWVsZCwgXCJtYXAgdmFsdWUgbXVzdCBub3QgYmUgbnVsbFwiKTtcbiAgICAgICAgfVxuICAgICAgICBsZXQgdmFsdWU7XG4gICAgICAgIHN3aXRjaCAoZmllbGQubWFwS2luZCkge1xuICAgICAgICAgICAgY2FzZSBcIm1lc3NhZ2VcIjpcbiAgICAgICAgICAgICAgICBjb25zdCBtc2dWYWx1ZSA9IHJlZmxlY3QoZmllbGQubWVzc2FnZSk7XG4gICAgICAgICAgICAgICAgcmVhZE1lc3NhZ2UobXNnVmFsdWUsIGpzb25NYXBWYWx1ZSwgb3B0cyk7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSBtc2dWYWx1ZTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJlbnVtXCI6XG4gICAgICAgICAgICAgICAgdmFsdWUgPSByZWFkRW51bShmaWVsZC5lbnVtLCBqc29uTWFwVmFsdWUsIG9wdHMuaWdub3JlVW5rbm93bkZpZWxkcywgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlID09PSB0b2tlbklnbm9yZWRVbmtub3duRW51bSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcInNjYWxhclwiOlxuICAgICAgICAgICAgICAgIHZhbHVlID0gc2NhbGFyRnJvbUpzb24oZmllbGQsIGpzb25NYXBWYWx1ZSwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qga2V5ID0gbWFwS2V5RnJvbUpzb24oZmllbGQubWFwS2V5LCBqc29uTWFwS2V5KTtcbiAgICAgICAgbWFwLnNldChrZXksIHZhbHVlKTtcbiAgICB9XG59XG5mdW5jdGlvbiByZWFkTGlzdEZpZWxkKGxpc3QsIGpzb24sIG9wdHMpIHtcbiAgICBpZiAoanNvbiA9PT0gbnVsbCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGZpZWxkID0gbGlzdC5maWVsZCgpO1xuICAgIGlmICghQXJyYXkuaXNBcnJheShqc29uKSkge1xuICAgICAgICB0aHJvdyBuZXcgRmllbGRFcnJvcihmaWVsZCwgXCJleHBlY3RlZCBBcnJheSwgZ290IFwiICsgZm9ybWF0VmFsKGpzb24pKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBqc29uSXRlbSBvZiBqc29uKSB7XG4gICAgICAgIGlmIChqc29uSXRlbSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEZpZWxkRXJyb3IoZmllbGQsIFwibGlzdCBpdGVtIG11c3Qgbm90IGJlIG51bGxcIik7XG4gICAgICAgIH1cbiAgICAgICAgc3dpdGNoIChmaWVsZC5saXN0S2luZCkge1xuICAgICAgICAgICAgY2FzZSBcIm1lc3NhZ2VcIjpcbiAgICAgICAgICAgICAgICBjb25zdCBtc2dWYWx1ZSA9IHJlZmxlY3QoZmllbGQubWVzc2FnZSk7XG4gICAgICAgICAgICAgICAgcmVhZE1lc3NhZ2UobXNnVmFsdWUsIGpzb25JdGVtLCBvcHRzKTtcbiAgICAgICAgICAgICAgICBsaXN0LmFkZChtc2dWYWx1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiZW51bVwiOlxuICAgICAgICAgICAgICAgIGNvbnN0IGVudW1WYWx1ZSA9IHJlYWRFbnVtKGZpZWxkLmVudW0sIGpzb25JdGVtLCBvcHRzLmlnbm9yZVVua25vd25GaWVsZHMsIHRydWUpO1xuICAgICAgICAgICAgICAgIGlmIChlbnVtVmFsdWUgIT09IHRva2VuSWdub3JlZFVua25vd25FbnVtKSB7XG4gICAgICAgICAgICAgICAgICAgIGxpc3QuYWRkKGVudW1WYWx1ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcInNjYWxhclwiOlxuICAgICAgICAgICAgICAgIGxpc3QuYWRkKHNjYWxhckZyb21Kc29uKGZpZWxkLCBqc29uSXRlbSwgdHJ1ZSkpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxufVxuZnVuY3Rpb24gcmVhZE1lc3NhZ2VGaWVsZChtc2csIGZpZWxkLCBqc29uLCBvcHRzKSB7XG4gICAgaWYgKGpzb24gPT09IG51bGwgJiYgZmllbGQubWVzc2FnZS50eXBlTmFtZSAhPSBcImdvb2dsZS5wcm90b2J1Zi5WYWx1ZVwiKSB7XG4gICAgICAgIG1zZy5jbGVhcihmaWVsZCk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgbXNnVmFsdWUgPSBtc2cuaXNTZXQoZmllbGQpID8gbXNnLmdldChmaWVsZCkgOiByZWZsZWN0KGZpZWxkLm1lc3NhZ2UpO1xuICAgIHJlYWRNZXNzYWdlKG1zZ1ZhbHVlLCBqc29uLCBvcHRzKTtcbiAgICBtc2cuc2V0KGZpZWxkLCBtc2dWYWx1ZSk7XG59XG5mdW5jdGlvbiByZWFkRW51bUZpZWxkKG1zZywgZmllbGQsIGpzb24sIG9wdHMpIHtcbiAgICBjb25zdCBlbnVtVmFsdWUgPSByZWFkRW51bShmaWVsZC5lbnVtLCBqc29uLCBvcHRzLmlnbm9yZVVua25vd25GaWVsZHMsIGZhbHNlKTtcbiAgICBpZiAoZW51bVZhbHVlID09PSB0b2tlbk51bGwpIHtcbiAgICAgICAgbXNnLmNsZWFyKGZpZWxkKTtcbiAgICB9XG4gICAgZWxzZSBpZiAoZW51bVZhbHVlICE9PSB0b2tlbklnbm9yZWRVbmtub3duRW51bSkge1xuICAgICAgICBtc2cuc2V0KGZpZWxkLCBlbnVtVmFsdWUpO1xuICAgIH1cbn1cbmZ1bmN0aW9uIHJlYWRTY2FsYXJGaWVsZChtc2csIGZpZWxkLCBqc29uKSB7XG4gICAgY29uc3Qgc2NhbGFyVmFsdWUgPSBzY2FsYXJGcm9tSnNvbihmaWVsZCwganNvbiwgZmFsc2UpO1xuICAgIGlmIChzY2FsYXJWYWx1ZSA9PT0gdG9rZW5OdWxsKSB7XG4gICAgICAgIG1zZy5jbGVhcihmaWVsZCk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBtc2cuc2V0KGZpZWxkLCBzY2FsYXJWYWx1ZSk7XG4gICAgfVxufVxuY29uc3QgdG9rZW5JZ25vcmVkVW5rbm93bkVudW0gPSBTeW1ib2woKTtcbmZ1bmN0aW9uIHJlYWRFbnVtKGRlc2MsIGpzb24sIGlnbm9yZVVua25vd25GaWVsZHMsIG51bGxBc1plcm9WYWx1ZSkge1xuICAgIGlmIChqc29uID09PSBudWxsKSB7XG4gICAgICAgIGlmIChkZXNjLnR5cGVOYW1lID09IFwiZ29vZ2xlLnByb3RvYnVmLk51bGxWYWx1ZVwiKSB7XG4gICAgICAgICAgICByZXR1cm4gMDsgLy8gZ29vZ2xlLnByb3RvYnVmLk51bGxWYWx1ZS5OVUxMX1ZBTFVFID0gMFxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsQXNaZXJvVmFsdWUgPyBkZXNjLnZhbHVlc1swXS5udW1iZXIgOiB0b2tlbk51bGw7XG4gICAgfVxuICAgIHN3aXRjaCAodHlwZW9mIGpzb24pIHtcbiAgICAgICAgY2FzZSBcIm51bWJlclwiOlxuICAgICAgICAgICAgaWYgKE51bWJlci5pc0ludGVnZXIoanNvbikpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ganNvbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwic3RyaW5nXCI6XG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IGRlc2MudmFsdWVzLmZpbmQoKGV2KSA9PiBldi5uYW1lID09PSBqc29uKTtcbiAgICAgICAgICAgIGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLm51bWJlcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpZ25vcmVVbmtub3duRmllbGRzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRva2VuSWdub3JlZFVua25vd25FbnVtO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGRlY29kZSAke2Rlc2N9IGZyb20gSlNPTjogJHtmb3JtYXRWYWwoanNvbil9YCk7XG59XG5jb25zdCB0b2tlbk51bGwgPSBTeW1ib2woKTtcbmZ1bmN0aW9uIHNjYWxhckZyb21Kc29uKGZpZWxkLCBqc29uLCBudWxsQXNaZXJvVmFsdWUpIHtcbiAgICBpZiAoanNvbiA9PT0gbnVsbCkge1xuICAgICAgICBpZiAobnVsbEFzWmVyb1ZhbHVlKSB7XG4gICAgICAgICAgICByZXR1cm4gc2NhbGFyWmVyb1ZhbHVlKGZpZWxkLnNjYWxhciwgZmFsc2UpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0b2tlbk51bGw7XG4gICAgfVxuICAgIC8vIGludDY0LCBzZml4ZWQ2NCwgc2ludDY0LCBmaXhlZDY0LCB1aW50NjQ6IFJlZmxlY3Qgc3VwcG9ydHMgc3RyaW5nIGFuZCBudW1iZXIuXG4gICAgLy8gc3RyaW5nLCBib29sOiBTdXBwb3J0ZWQgYnkgcmVmbGVjdC5cbiAgICBzd2l0Y2ggKGZpZWxkLnNjYWxhcikge1xuICAgICAgICAvLyBmbG9hdCwgZG91YmxlOiBKU09OIHZhbHVlIHdpbGwgYmUgYSBudW1iZXIgb3Igb25lIG9mIHRoZSBzcGVjaWFsIHN0cmluZyB2YWx1ZXMgXCJOYU5cIiwgXCJJbmZpbml0eVwiLCBhbmQgXCItSW5maW5pdHlcIi5cbiAgICAgICAgLy8gRWl0aGVyIG51bWJlcnMgb3Igc3RyaW5ncyBhcmUgYWNjZXB0ZWQuIEV4cG9uZW50IG5vdGF0aW9uIGlzIGFsc28gYWNjZXB0ZWQuXG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5ET1VCTEU6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5GTE9BVDpcbiAgICAgICAgICAgIGlmIChqc29uID09PSBcIk5hTlwiKVxuICAgICAgICAgICAgICAgIHJldHVybiBOYU47XG4gICAgICAgICAgICBpZiAoanNvbiA9PT0gXCJJbmZpbml0eVwiKVxuICAgICAgICAgICAgICAgIHJldHVybiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG4gICAgICAgICAgICBpZiAoanNvbiA9PT0gXCItSW5maW5pdHlcIilcbiAgICAgICAgICAgICAgICByZXR1cm4gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBqc29uID09IFwibnVtYmVyXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoTnVtYmVyLmlzTmFOKGpzb24pKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIE5hTiBtdXN0IGJlIGVuY29kZWQgd2l0aCBzdHJpbmcgY29uc3RhbnRzXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBGaWVsZEVycm9yKGZpZWxkLCBcInVuZXhwZWN0ZWQgTmFOIG51bWJlclwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoanNvbikpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gSW5maW5pdHkgbXVzdCBiZSBlbmNvZGVkIHdpdGggc3RyaW5nIGNvbnN0YW50c1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRmllbGRFcnJvcihmaWVsZCwgXCJ1bmV4cGVjdGVkIGluZmluaXRlIG51bWJlclwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodHlwZW9mIGpzb24gPT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgIGlmIChqc29uID09PSBcIlwiKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGVtcHR5IHN0cmluZyBpcyBub3QgYSBudW1iZXJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChqc29uLnRyaW0oKS5sZW5ndGggIT09IGpzb24ubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGV4dHJhIHdoaXRlc3BhY2VcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IGZsb2F0ID0gTnVtYmVyKGpzb24pO1xuICAgICAgICAgICAgICAgIGlmICghTnVtYmVyLmlzRmluaXRlKGZsb2F0KSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBJbmZpbml0eSBhbmQgTmFOIG11c3QgYmUgZW5jb2RlZCB3aXRoIHN0cmluZyBjb25zdGFudHNcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBmbG9hdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAvLyBpbnQzMiwgZml4ZWQzMiwgdWludDMyOiBKU09OIHZhbHVlIHdpbGwgYmUgYSBkZWNpbWFsIG51bWJlci4gRWl0aGVyIG51bWJlcnMgb3Igc3RyaW5ncyBhcmUgYWNjZXB0ZWQuXG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5JTlQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkZJWEVEMzI6XG4gICAgICAgIGNhc2UgU2NhbGFyVHlwZS5TRklYRUQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNJTlQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlVJTlQzMjpcbiAgICAgICAgICAgIHJldHVybiBpbnQzMkZyb21Kc29uKGpzb24pO1xuICAgICAgICAvLyBieXRlczogSlNPTiB2YWx1ZSB3aWxsIGJlIHRoZSBkYXRhIGVuY29kZWQgYXMgYSBzdHJpbmcgdXNpbmcgc3RhbmRhcmQgYmFzZTY0IGVuY29kaW5nIHdpdGggcGFkZGluZ3MuXG4gICAgICAgIC8vIEVpdGhlciBzdGFuZGFyZCBvciBVUkwtc2FmZSBiYXNlNjQgZW5jb2Rpbmcgd2l0aC93aXRob3V0IHBhZGRpbmdzIGFyZSBhY2NlcHRlZC5cbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLkJZVEVTOlxuICAgICAgICAgICAgaWYgKHR5cGVvZiBqc29uID09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAoanNvbiA9PT0gXCJcIikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFVpbnQ4QXJyYXkoMCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBiYXNlNjREZWNvZGUoanNvbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSk7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBGaWVsZEVycm9yKGZpZWxkLCBtZXNzYWdlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIGpzb247XG59XG4vKipcbiAqIFRyeSB0byBwYXJzZSBhIEpTT04gdmFsdWUgdG8gYSBtYXAga2V5IGZvciB0aGUgcmVmbGVjdCBBUEkuXG4gKlxuICogUmV0dXJucyB0aGUgaW5wdXQgaWYgdGhlIEpTT04gdmFsdWUgY2Fubm90IGJlIGNvbnZlcnRlZC5cbiAqL1xuZnVuY3Rpb24gbWFwS2V5RnJvbUpzb24odHlwZSwganNvbikge1xuICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICBjYXNlIFNjYWxhclR5cGUuQk9PTDpcbiAgICAgICAgICAgIHN3aXRjaCAoanNvbikge1xuICAgICAgICAgICAgICAgIGNhc2UgXCJ0cnVlXCI6XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIGNhc2UgXCJmYWxzZVwiOlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4ganNvbjtcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLklOVDMyOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuRklYRUQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlVJTlQzMjpcbiAgICAgICAgY2FzZSBTY2FsYXJUeXBlLlNGSVhFRDMyOlxuICAgICAgICBjYXNlIFNjYWxhclR5cGUuU0lOVDMyOlxuICAgICAgICAgICAgcmV0dXJuIGludDMyRnJvbUpzb24oanNvbik7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4ganNvbjtcbiAgICB9XG59XG4vKipcbiAqIFRyeSB0byBwYXJzZSBhIEpTT04gdmFsdWUgdG8gYSAzMi1iaXQgaW50ZWdlciBmb3IgdGhlIHJlZmxlY3QgQVBJLlxuICpcbiAqIFJldHVybnMgdGhlIGlucHV0IGlmIHRoZSBKU09OIHZhbHVlIGNhbm5vdCBiZSBjb252ZXJ0ZWQuXG4gKi9cbmZ1bmN0aW9uIGludDMyRnJvbUpzb24oanNvbikge1xuICAgIGlmICh0eXBlb2YganNvbiA9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIGlmIChqc29uID09PSBcIlwiKSB7XG4gICAgICAgICAgICAvLyBlbXB0eSBzdHJpbmcgaXMgbm90IGEgbnVtYmVyXG4gICAgICAgICAgICByZXR1cm4ganNvbjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvbi50cmltKCkubGVuZ3RoICE9PSBqc29uLmxlbmd0aCkge1xuICAgICAgICAgICAgLy8gZXh0cmEgd2hpdGVzcGFjZVxuICAgICAgICAgICAgcmV0dXJuIGpzb247XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgbnVtID0gTnVtYmVyKGpzb24pO1xuICAgICAgICBpZiAoTnVtYmVyLmlzTmFOKG51bSkpIHtcbiAgICAgICAgICAgIC8vIG5vdCBhIG51bWJlclxuICAgICAgICAgICAgcmV0dXJuIGpzb247XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bTtcbiAgICB9XG4gICAgcmV0dXJuIGpzb247XG59XG5mdW5jdGlvbiBwYXJzZUpzb25TdHJpbmcoanNvblN0cmluZywgdHlwZU5hbWUpIHtcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShqc29uU3RyaW5nKTtcbiAgICB9XG4gICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc3QgbWVzc2FnZSA9IGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IFN0cmluZyhlKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZGVjb2RlIG1lc3NhZ2UgJHt0eXBlTmFtZX0gZnJvbSBKU09OOiAke21lc3NhZ2V9YCwgXG4gICAgICAgIC8vIEB0cy1leHBlY3QtZXJyb3Igd2UgdXNlIHRoZSBFUzIwMjIgZXJyb3IgQ1RPUiBvcHRpb24gXCJjYXVzZVwiIGZvciBiZXR0ZXIgc3RhY2sgdHJhY2VzXG4gICAgICAgIHsgY2F1c2U6IGUgfSk7XG4gICAgfVxufVxuZnVuY3Rpb24gdHJ5V2t0RnJvbUpzb24obXNnLCBqc29uVmFsdWUsIG9wdHMpIHtcbiAgICBpZiAoIW1zZy5kZXNjLnR5cGVOYW1lLnN0YXJ0c1dpdGgoXCJnb29nbGUucHJvdG9idWYuXCIpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgc3dpdGNoIChtc2cuZGVzYy50eXBlTmFtZSkge1xuICAgICAgICBjYXNlIFwiZ29vZ2xlLnByb3RvYnVmLkFueVwiOlxuICAgICAgICAgICAgYW55RnJvbUpzb24obXNnLm1lc3NhZ2UsIGpzb25WYWx1ZSwgb3B0cyk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgY2FzZSBcImdvb2dsZS5wcm90b2J1Zi5UaW1lc3RhbXBcIjpcbiAgICAgICAgICAgIHRpbWVzdGFtcEZyb21Kc29uKG1zZy5tZXNzYWdlLCBqc29uVmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGNhc2UgXCJnb29nbGUucHJvdG9idWYuRHVyYXRpb25cIjpcbiAgICAgICAgICAgIGR1cmF0aW9uRnJvbUpzb24obXNnLm1lc3NhZ2UsIGpzb25WYWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgY2FzZSBcImdvb2dsZS5wcm90b2J1Zi5GaWVsZE1hc2tcIjpcbiAgICAgICAgICAgIGZpZWxkTWFza0Zyb21Kc29uKG1zZy5tZXNzYWdlLCBqc29uVmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGNhc2UgXCJnb29nbGUucHJvdG9idWYuU3RydWN0XCI6XG4gICAgICAgICAgICBzdHJ1Y3RGcm9tSnNvbihtc2cubWVzc2FnZSwganNvblZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICBjYXNlIFwiZ29vZ2xlLnByb3RvYnVmLlZhbHVlXCI6XG4gICAgICAgICAgICB2YWx1ZUZyb21Kc29uKG1zZy5tZXNzYWdlLCBqc29uVmFsdWUpO1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIGNhc2UgXCJnb29nbGUucHJvdG9idWYuTGlzdFZhbHVlXCI6XG4gICAgICAgICAgICBsaXN0VmFsdWVGcm9tSnNvbihtc2cubWVzc2FnZSwganNvblZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgaWYgKGlzV3JhcHBlckRlc2MobXNnLmRlc2MpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdmFsdWVGaWVsZCA9IG1zZy5kZXNjLmZpZWxkc1swXTtcbiAgICAgICAgICAgICAgICBpZiAoanNvblZhbHVlID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIG1zZy5jbGVhcih2YWx1ZUZpZWxkKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIG1zZy5zZXQodmFsdWVGaWVsZCwgc2NhbGFyRnJvbUpzb24odmFsdWVGaWVsZCwganNvblZhbHVlLCB0cnVlKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbn1cbmZ1bmN0aW9uIGFueUZyb21Kc29uKGFueSwganNvbiwgb3B0cykge1xuICAgIHZhciBfYTtcbiAgICBpZiAoanNvbiA9PT0gbnVsbCB8fCBBcnJheS5pc0FycmF5KGpzb24pIHx8IHR5cGVvZiBqc29uICE9IFwib2JqZWN0XCIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZGVjb2RlIG1lc3NhZ2UgJHthbnkuJHR5cGVOYW1lfSBmcm9tIEpTT046IGV4cGVjdGVkIG9iamVjdCBidXQgZ290ICR7Zm9ybWF0VmFsKGpzb24pfWApO1xuICAgIH1cbiAgICBpZiAoT2JqZWN0LmtleXMoanNvbikubGVuZ3RoID09IDApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB0eXBlVXJsID0ganNvbltcIkB0eXBlXCJdO1xuICAgIGlmICh0eXBlb2YgdHlwZVVybCAhPSBcInN0cmluZ1wiIHx8IHR5cGVVcmwgPT0gXCJcIikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGNhbm5vdCBkZWNvZGUgbWVzc2FnZSAke2FueS4kdHlwZU5hbWV9IGZyb20gSlNPTjogXCJAdHlwZVwiIGlzIGVtcHR5YCk7XG4gICAgfVxuICAgIGNvbnN0IHR5cGVOYW1lID0gdHlwZVVybC5pbmNsdWRlcyhcIi9cIilcbiAgICAgICAgPyB0eXBlVXJsLnN1YnN0cmluZyh0eXBlVXJsLmxhc3RJbmRleE9mKFwiL1wiKSArIDEpXG4gICAgICAgIDogdHlwZVVybDtcbiAgICBpZiAoIXR5cGVOYW1lLmxlbmd0aCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGNhbm5vdCBkZWNvZGUgbWVzc2FnZSAke2FueS4kdHlwZU5hbWV9IGZyb20gSlNPTjogXCJAdHlwZVwiIGlzIGludmFsaWRgKTtcbiAgICB9XG4gICAgY29uc3QgZGVzYyA9IChfYSA9IG9wdHMucmVnaXN0cnkpID09PSBudWxsIHx8IF9hID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfYS5nZXRNZXNzYWdlKHR5cGVOYW1lKTtcbiAgICBpZiAoIWRlc2MpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZGVjb2RlIG1lc3NhZ2UgJHthbnkuJHR5cGVOYW1lfSBmcm9tIEpTT046ICR7dHlwZVVybH0gaXMgbm90IGluIHRoZSB0eXBlIHJlZ2lzdHJ5YCk7XG4gICAgfVxuICAgIGNvbnN0IG1zZyA9IHJlZmxlY3QoZGVzYyk7XG4gICAgaWYgKHR5cGVOYW1lLnN0YXJ0c1dpdGgoXCJnb29nbGUucHJvdG9idWYuXCIpICYmXG4gICAgICAgIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChqc29uLCBcInZhbHVlXCIpKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0ganNvbi52YWx1ZTtcbiAgICAgICAgcmVhZE1lc3NhZ2UobXNnLCB2YWx1ZSwgb3B0cyk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBjb25zdCBjb3B5ID0gT2JqZWN0LmFzc2lnbih7fSwganNvbik7XG4gICAgICAgIC8vIGJpb21lLWlnbm9yZSBsaW50L3BlcmZvcm1hbmNlL25vRGVsZXRlOiA8ZXhwbGFuYXRpb24+XG4gICAgICAgIGRlbGV0ZSBjb3B5W1wiQHR5cGVcIl07XG4gICAgICAgIHJlYWRNZXNzYWdlKG1zZywgY29weSwgb3B0cyk7XG4gICAgfVxuICAgIGFueVBhY2sobXNnLmRlc2MsIG1zZy5tZXNzYWdlLCBhbnkpO1xufVxuZnVuY3Rpb24gdGltZXN0YW1wRnJvbUpzb24odGltZXN0YW1wLCBqc29uKSB7XG4gICAgaWYgKHR5cGVvZiBqc29uICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGRlY29kZSBtZXNzYWdlICR7dGltZXN0YW1wLiR0eXBlTmFtZX0gZnJvbSBKU09OOiAke2Zvcm1hdFZhbChqc29uKX1gKTtcbiAgICB9XG4gICAgY29uc3QgbWF0Y2hlcyA9IGpzb24ubWF0Y2goL14oWzAtOV17NH0pLShbMC05XXsyfSktKFswLTldezJ9KVQoWzAtOV17Mn0pOihbMC05XXsyfSk6KFswLTldezJ9KSg/OlxcLihbMC05XXsxLDl9KSk/KD86WnwoWystXVswLTldWzAtOV06WzAtOV1bMC05XSkpJC8pO1xuICAgIGlmICghbWF0Y2hlcykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGNhbm5vdCBkZWNvZGUgbWVzc2FnZSAke3RpbWVzdGFtcC4kdHlwZU5hbWV9IGZyb20gSlNPTjogaW52YWxpZCBSRkMgMzMzOSBzdHJpbmdgKTtcbiAgICB9XG4gICAgY29uc3QgbXMgPSBEYXRlLnBhcnNlKFxuICAgIC8vIGJpb21lLWlnbm9yZSBmb3JtYXQ6IHdhbnQgdGhpcyB0byByZWFkIHdlbGxcbiAgICBtYXRjaGVzWzFdICsgXCItXCIgKyBtYXRjaGVzWzJdICsgXCItXCIgKyBtYXRjaGVzWzNdICsgXCJUXCIgKyBtYXRjaGVzWzRdICsgXCI6XCIgKyBtYXRjaGVzWzVdICsgXCI6XCIgKyBtYXRjaGVzWzZdICsgKG1hdGNoZXNbOF0gPyBtYXRjaGVzWzhdIDogXCJaXCIpKTtcbiAgICBpZiAoTnVtYmVyLmlzTmFOKG1zKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGNhbm5vdCBkZWNvZGUgbWVzc2FnZSAke3RpbWVzdGFtcC4kdHlwZU5hbWV9IGZyb20gSlNPTjogaW52YWxpZCBSRkMgMzMzOSBzdHJpbmdgKTtcbiAgICB9XG4gICAgaWYgKG1zIDwgRGF0ZS5wYXJzZShcIjAwMDEtMDEtMDFUMDA6MDA6MDBaXCIpIHx8XG4gICAgICAgIG1zID4gRGF0ZS5wYXJzZShcIjk5OTktMTItMzFUMjM6NTk6NTlaXCIpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGRlY29kZSBtZXNzYWdlICR7dGltZXN0YW1wLiR0eXBlTmFtZX0gZnJvbSBKU09OOiBtdXN0IGJlIGZyb20gMDAwMS0wMS0wMVQwMDowMDowMFogdG8gOTk5OS0xMi0zMVQyMzo1OTo1OVogaW5jbHVzaXZlYCk7XG4gICAgfVxuICAgIHRpbWVzdGFtcC5zZWNvbmRzID0gcHJvdG9JbnQ2NC5wYXJzZShtcyAvIDEwMDApO1xuICAgIHRpbWVzdGFtcC5uYW5vcyA9IDA7XG4gICAgaWYgKG1hdGNoZXNbN10pIHtcbiAgICAgICAgdGltZXN0YW1wLm5hbm9zID1cbiAgICAgICAgICAgIHBhcnNlSW50KFwiMVwiICsgbWF0Y2hlc1s3XSArIFwiMFwiLnJlcGVhdCg5IC0gbWF0Y2hlc1s3XS5sZW5ndGgpKSAtXG4gICAgICAgICAgICAgICAgMTAwMDAwMDAwMDtcbiAgICB9XG59XG5mdW5jdGlvbiBkdXJhdGlvbkZyb21Kc29uKGR1cmF0aW9uLCBqc29uKSB7XG4gICAgaWYgKHR5cGVvZiBqc29uICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGRlY29kZSBtZXNzYWdlICR7ZHVyYXRpb24uJHR5cGVOYW1lfSBmcm9tIEpTT046ICR7Zm9ybWF0VmFsKGpzb24pfWApO1xuICAgIH1cbiAgICBjb25zdCBtYXRjaCA9IGpzb24ubWF0Y2goL14oLT9bMC05XSspKD86XFwuKFswLTldKykpP3MvKTtcbiAgICBpZiAobWF0Y2ggPT09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZGVjb2RlIG1lc3NhZ2UgJHtkdXJhdGlvbi4kdHlwZU5hbWV9IGZyb20gSlNPTjogJHtmb3JtYXRWYWwoanNvbil9YCk7XG4gICAgfVxuICAgIGNvbnN0IGxvbmdTZWNvbmRzID0gTnVtYmVyKG1hdGNoWzFdKTtcbiAgICBpZiAobG9uZ1NlY29uZHMgPiAzMTU1NzYwMDAwMDAgfHwgbG9uZ1NlY29uZHMgPCAtMzE1NTc2MDAwMDAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGRlY29kZSBtZXNzYWdlICR7ZHVyYXRpb24uJHR5cGVOYW1lfSBmcm9tIEpTT046ICR7Zm9ybWF0VmFsKGpzb24pfWApO1xuICAgIH1cbiAgICBkdXJhdGlvbi5zZWNvbmRzID0gcHJvdG9JbnQ2NC5wYXJzZShsb25nU2Vjb25kcyk7XG4gICAgaWYgKHR5cGVvZiBtYXRjaFsyXSAhPT0gXCJzdHJpbmdcIikge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IG5hbm9zU3RyID0gbWF0Y2hbMl0gKyBcIjBcIi5yZXBlYXQoOSAtIG1hdGNoWzJdLmxlbmd0aCk7XG4gICAgZHVyYXRpb24ubmFub3MgPSBwYXJzZUludChuYW5vc1N0cik7XG4gICAgaWYgKGxvbmdTZWNvbmRzIDwgMCB8fCBPYmplY3QuaXMobG9uZ1NlY29uZHMsIC0wKSkge1xuICAgICAgICBkdXJhdGlvbi5uYW5vcyA9IC1kdXJhdGlvbi5uYW5vcztcbiAgICB9XG59XG5mdW5jdGlvbiBmaWVsZE1hc2tGcm9tSnNvbihmaWVsZE1hc2ssIGpzb24pIHtcbiAgICBpZiAodHlwZW9mIGpzb24gIT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZGVjb2RlIG1lc3NhZ2UgJHtmaWVsZE1hc2suJHR5cGVOYW1lfSBmcm9tIEpTT046ICR7Zm9ybWF0VmFsKGpzb24pfWApO1xuICAgIH1cbiAgICBpZiAoanNvbiA9PT0gXCJcIikge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGZ1bmN0aW9uIGNhbWVsVG9TbmFrZShzdHIpIHtcbiAgICAgICAgaWYgKHN0ci5pbmNsdWRlcyhcIl9cIikpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGRlY29kZSBtZXNzYWdlICR7ZmllbGRNYXNrLiR0eXBlTmFtZX0gZnJvbSBKU09OOiBwYXRoIG5hbWVzIG11c3QgYmUgbG93ZXJDYW1lbENhc2VgKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzYyA9IHN0ci5yZXBsYWNlKC9bQS1aXS9nLCAobGV0dGVyKSA9PiBcIl9cIiArIGxldHRlci50b0xvd2VyQ2FzZSgpKTtcbiAgICAgICAgcmV0dXJuIHNjWzBdID09PSBcIl9cIiA/IHNjLnN1YnN0cmluZygxKSA6IHNjO1xuICAgIH1cbiAgICBmaWVsZE1hc2sucGF0aHMgPSBqc29uLnNwbGl0KFwiLFwiKS5tYXAoY2FtZWxUb1NuYWtlKTtcbn1cbmZ1bmN0aW9uIHN0cnVjdEZyb21Kc29uKHN0cnVjdCwganNvbikge1xuICAgIGlmICh0eXBlb2YganNvbiAhPSBcIm9iamVjdFwiIHx8IGpzb24gPT0gbnVsbCB8fCBBcnJheS5pc0FycmF5KGpzb24pKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGRlY29kZSBtZXNzYWdlICR7c3RydWN0LiR0eXBlTmFtZX0gZnJvbSBKU09OICR7Zm9ybWF0VmFsKGpzb24pfWApO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IFtrLCB2XSBvZiBPYmplY3QuZW50cmllcyhqc29uKSkge1xuICAgICAgICBjb25zdCBwYXJzZWRWID0gY3JlYXRlKFZhbHVlU2NoZW1hKTtcbiAgICAgICAgdmFsdWVGcm9tSnNvbihwYXJzZWRWLCB2KTtcbiAgICAgICAgc3RydWN0LmZpZWxkc1trXSA9IHBhcnNlZFY7XG4gICAgfVxufVxuZnVuY3Rpb24gdmFsdWVGcm9tSnNvbih2YWx1ZSwganNvbikge1xuICAgIHN3aXRjaCAodHlwZW9mIGpzb24pIHtcbiAgICAgICAgY2FzZSBcIm51bWJlclwiOlxuICAgICAgICAgICAgdmFsdWUua2luZCA9IHsgY2FzZTogXCJudW1iZXJWYWx1ZVwiLCB2YWx1ZToganNvbiB9O1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJzdHJpbmdcIjpcbiAgICAgICAgICAgIHZhbHVlLmtpbmQgPSB7IGNhc2U6IFwic3RyaW5nVmFsdWVcIiwgdmFsdWU6IGpzb24gfTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiYm9vbGVhblwiOlxuICAgICAgICAgICAgdmFsdWUua2luZCA9IHsgY2FzZTogXCJib29sVmFsdWVcIiwgdmFsdWU6IGpzb24gfTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwib2JqZWN0XCI6XG4gICAgICAgICAgICBpZiAoanNvbiA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHZhbHVlLmtpbmQgPSB7IGNhc2U6IFwibnVsbFZhbHVlXCIsIHZhbHVlOiBOdWxsVmFsdWUuTlVMTF9WQUxVRSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoQXJyYXkuaXNBcnJheShqc29uKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGxpc3RWYWx1ZSA9IGNyZWF0ZShMaXN0VmFsdWVTY2hlbWEpO1xuICAgICAgICAgICAgICAgIGxpc3RWYWx1ZUZyb21Kc29uKGxpc3RWYWx1ZSwganNvbik7XG4gICAgICAgICAgICAgICAgdmFsdWUua2luZCA9IHsgY2FzZTogXCJsaXN0VmFsdWVcIiwgdmFsdWU6IGxpc3RWYWx1ZSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3RydWN0ID0gY3JlYXRlKFN0cnVjdFNjaGVtYSk7XG4gICAgICAgICAgICAgICAgc3RydWN0RnJvbUpzb24oc3RydWN0LCBqc29uKTtcbiAgICAgICAgICAgICAgICB2YWx1ZS5raW5kID0geyBjYXNlOiBcInN0cnVjdFZhbHVlXCIsIHZhbHVlOiBzdHJ1Y3QgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBjYW5ub3QgZGVjb2RlIG1lc3NhZ2UgJHt2YWx1ZS4kdHlwZU5hbWV9IGZyb20gSlNPTiAke2Zvcm1hdFZhbChqc29uKX1gKTtcbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlO1xufVxuZnVuY3Rpb24gbGlzdFZhbHVlRnJvbUpzb24obGlzdFZhbHVlLCBqc29uKSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGpzb24pKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgY2Fubm90IGRlY29kZSBtZXNzYWdlICR7bGlzdFZhbHVlLiR0eXBlTmFtZX0gZnJvbSBKU09OICR7Zm9ybWF0VmFsKGpzb24pfWApO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGUgb2YganNvbikge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGNyZWF0ZShWYWx1ZVNjaGVtYSk7XG4gICAgICAgIHZhbHVlRnJvbUpzb24odmFsdWUsIGUpO1xuICAgICAgICBsaXN0VmFsdWUudmFsdWVzLnB1c2godmFsdWUpO1xuICAgIH1cbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuaW1wb3J0IHsgcmVmbGVjdCB9IGZyb20gXCIuL3JlZmxlY3QvcmVmbGVjdC5qc1wiO1xuLyoqXG4gKiBNZXJnZSBtZXNzYWdlIGBzb3VyY2VgIGludG8gbWVzc2FnZSBgdGFyZ2V0YCwgZm9sbG93aW5nIFByb3RvYnVmIHNlbWFudGljcy5cbiAqXG4gKiBUaGlzIGlzIHRoZSBzYW1lIGFzIHNlcmlhbGl6aW5nIHRoZSBzb3VyY2UgbWVzc2FnZSwgdGhlbiBkZXNlcmlhbGl6aW5nIGl0XG4gKiBpbnRvIHRoZSB0YXJnZXQgbWVzc2FnZSB2aWEgYG1lcmdlRnJvbUJpbmFyeSgpYCwgd2l0aCBvbmUgZGlmZmVyZW5jZTpcbiAqIFdoaWxlIHNlcmlhbGl6YXRpb24gd2lsbCBjcmVhdGUgYSBjb3B5IG9mIGFsbCB2YWx1ZXMsIGBtZXJnZSgpYCB3aWxsIGNvcHlcbiAqIHRoZSByZWZlcmVuY2UgZm9yIGBieXRlc2AgYW5kIG1lc3NhZ2VzLlxuICpcbiAqIEFsc28gc2VlIGh0dHBzOi8vcHJvdG9idWYuY29tL2RvY3MvbGFuZ3VhZ2Utc3BlYyNtZXJnaW5nLXByb3RvYnVmLW1lc3NhZ2VzXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZShzY2hlbWEsIHRhcmdldCwgc291cmNlKSB7XG4gICAgcmVmbGVjdE1lcmdlKHJlZmxlY3Qoc2NoZW1hLCB0YXJnZXQpLCByZWZsZWN0KHNjaGVtYSwgc291cmNlKSk7XG59XG5mdW5jdGlvbiByZWZsZWN0TWVyZ2UodGFyZ2V0LCBzb3VyY2UpIHtcbiAgICB2YXIgX2E7XG4gICAgdmFyIF9iO1xuICAgIGNvbnN0IHNvdXJjZVVua25vd24gPSBzb3VyY2UubWVzc2FnZS4kdW5rbm93bjtcbiAgICBpZiAoc291cmNlVW5rbm93biAhPT0gdW5kZWZpbmVkICYmIHNvdXJjZVVua25vd24ubGVuZ3RoID4gMCkge1xuICAgICAgICAoX2EgPSAoX2IgPSB0YXJnZXQubWVzc2FnZSkuJHVua25vd24pICE9PSBudWxsICYmIF9hICE9PSB2b2lkIDAgPyBfYSA6IChfYi4kdW5rbm93biA9IFtdKTtcbiAgICAgICAgdGFyZ2V0Lm1lc3NhZ2UuJHVua25vd24ucHVzaCguLi5zb3VyY2VVbmtub3duKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBmIG9mIHRhcmdldC5maWVsZHMpIHtcbiAgICAgICAgaWYgKCFzb3VyY2UuaXNTZXQoZikpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHN3aXRjaCAoZi5maWVsZEtpbmQpIHtcbiAgICAgICAgICAgIGNhc2UgXCJzY2FsYXJcIjpcbiAgICAgICAgICAgIGNhc2UgXCJlbnVtXCI6XG4gICAgICAgICAgICAgICAgdGFyZ2V0LnNldChmLCBzb3VyY2UuZ2V0KGYpKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJtZXNzYWdlXCI6XG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldC5pc1NldChmKSkge1xuICAgICAgICAgICAgICAgICAgICByZWZsZWN0TWVyZ2UodGFyZ2V0LmdldChmKSwgc291cmNlLmdldChmKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQuc2V0KGYsIHNvdXJjZS5nZXQoZikpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJsaXN0XCI6XG4gICAgICAgICAgICAgICAgY29uc3QgbGlzdCA9IHRhcmdldC5nZXQoZik7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBlIG9mIHNvdXJjZS5nZXQoZikpIHtcbiAgICAgICAgICAgICAgICAgICAgbGlzdC5hZGQoZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcIm1hcFwiOlxuICAgICAgICAgICAgICAgIGNvbnN0IG1hcCA9IHRhcmdldC5nZXQoZik7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBbaywgdl0gb2Ygc291cmNlLmdldChmKSkge1xuICAgICAgICAgICAgICAgICAgICBtYXAuc2V0KGssIHYpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsICIvLyBDb3B5cmlnaHQgMjAyMS0yMDI1IEJ1ZiBUZWNobm9sb2dpZXMsIEluYy5cbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuZXhwb3J0ICogZnJvbSBcIi4vdHlwZXMuanNcIjtcbmV4cG9ydCAqIGZyb20gXCIuL2lzLW1lc3NhZ2UuanNcIjtcbmV4cG9ydCAqIGZyb20gXCIuL2NyZWF0ZS5qc1wiO1xuZXhwb3J0ICogZnJvbSBcIi4vY2xvbmUuanNcIjtcbmV4cG9ydCAqIGZyb20gXCIuL2Rlc2NyaXB0b3JzLmpzXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9lcXVhbHMuanNcIjtcbmV4cG9ydCAqIGZyb20gXCIuL2ZpZWxkcy5qc1wiO1xuZXhwb3J0ICogZnJvbSBcIi4vcmVnaXN0cnkuanNcIjtcbmV4cG9ydCB7IHRvQmluYXJ5IH0gZnJvbSBcIi4vdG8tYmluYXJ5LmpzXCI7XG5leHBvcnQgeyBmcm9tQmluYXJ5LCBtZXJnZUZyb21CaW5hcnkgfSBmcm9tIFwiLi9mcm9tLWJpbmFyeS5qc1wiO1xuZXhwb3J0ICogZnJvbSBcIi4vdG8tanNvbi5qc1wiO1xuZXhwb3J0ICogZnJvbSBcIi4vZnJvbS1qc29uLmpzXCI7XG5leHBvcnQgKiBmcm9tIFwiLi9tZXJnZS5qc1wiO1xuZXhwb3J0IHsgaGFzRXh0ZW5zaW9uLCBnZXRFeHRlbnNpb24sIHNldEV4dGVuc2lvbiwgY2xlYXJFeHRlbnNpb24sIGhhc09wdGlvbiwgZ2V0T3B0aW9uLCB9IGZyb20gXCIuL2V4dGVuc2lvbnMuanNcIjtcbmV4cG9ydCAqIGZyb20gXCIuL3Byb3RvLWludDY0LmpzXCI7XG4iLCAiLy8gUHJvdG9idWYgY29udmVyc2lvbiBoZWxwZXJzXG5pbXBvcnQgdHlwZSB7XG4gIEdob3N0LFxuICBNaXNzaWxlLFxuICBTdGF0ZVVwZGF0ZSxcbiAgRGFnTm9kZSxcbiAgRGFnU3RhdGUsXG4gIEludmVudG9yeUl0ZW0sXG4gIEludmVudG9yeSxcbiAgU3RvcnlTdGF0ZSxcbiAgU3RvcnlEaWFsb2d1ZSxcbiAgU3RvcnlFdmVudCxcbiAgU3RvcnlEaWFsb2d1ZUNob2ljZSxcbiAgU3RvcnlUdXRvcmlhbFRpcCxcbiAgVXBncmFkZUVmZmVjdCxcbiAgUGxheWVyQ2FwYWJpbGl0aWVzLFxufSBmcm9tICcuL3Byb3RvL3Byb3RvL3dzX21lc3NhZ2VzX3BiJztcbi8vIEltcG9ydCBlbnVtcyBhcyB2YWx1ZXMsIG5vdCB0eXBlc1xuaW1wb3J0IHtcbiAgRGFnTm9kZVN0YXR1cyxcbiAgRGFnTm9kZUtpbmQsXG4gIFN0b3J5SW50ZW50LFxufSBmcm9tICcuL3Byb3RvL3Byb3RvL3dzX21lc3NhZ2VzX3BiJztcblxuLy8gQWRhcHRlciB0eXBlcyBmb3IgY29tcGF0aWJpbGl0eSB3aXRoIGV4aXN0aW5nIGNvZGVcbmV4cG9ydCBpbnRlcmZhY2UgR2hvc3RTbmFwc2hvdCB7XG4gIGlkOiBzdHJpbmc7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICB0OiBudW1iZXI7XG4gIHNlbGY6IGJvb2xlYW47XG4gIHdheXBvaW50cz86IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHNwZWVkOiBudW1iZXIgfVtdO1xuICBjdXJyZW50V2F5cG9pbnRJbmRleD86IG51bWJlcjtcbiAgaHA6IG51bWJlcjtcbiAga2lsbHM6IG51bWJlcjtcbiAgaGVhdD86IHtcbiAgICB2OiBudW1iZXI7XG4gICAgbTogbnVtYmVyO1xuICAgIHc6IG51bWJlcjtcbiAgICBvOiBudW1iZXI7XG4gICAgbXM6IG51bWJlcjtcbiAgICBzdTogbnVtYmVyO1xuICAgIGt1OiBudW1iZXI7XG4gICAga2Q6IG51bWJlcjtcbiAgICBleDogbnVtYmVyO1xuICB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1pc3NpbGVTbmFwc2hvdCB7XG4gIGlkOiBzdHJpbmc7XG4gIG93bmVyOiBzdHJpbmc7XG4gIHNlbGY6IGJvb2xlYW47XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICB2eDogbnVtYmVyO1xuICB2eTogbnVtYmVyO1xuICB0OiBudW1iZXI7XG4gIGFncm9SYWRpdXM6IG51bWJlcjtcbiAgbGlmZXRpbWU6IG51bWJlcjtcbiAgbGF1bmNoOiBudW1iZXI7XG4gIGV4cGlyZXM6IG51bWJlcjtcbiAgdGFyZ2V0SWQ/OiBzdHJpbmc7XG4gIGhlYXQ/OiB7XG4gICAgdjogbnVtYmVyO1xuICAgIG06IG51bWJlcjtcbiAgICB3OiBudW1iZXI7XG4gICAgbzogbnVtYmVyO1xuICAgIG1zOiBudW1iZXI7XG4gICAgc3U6IG51bWJlcjtcbiAgICBrdTogbnVtYmVyO1xuICAgIGtkOiBudW1iZXI7XG4gICAgZXg6IG51bWJlcjtcbiAgfTtcbn1cblxuLy8gQ29udmVydCBwcm90byBHaG9zdCB0byBHaG9zdFNuYXBzaG90XG5leHBvcnQgZnVuY3Rpb24gcHJvdG9Ub0dob3N0KHByb3RvOiBHaG9zdCk6IEdob3N0U25hcHNob3Qge1xuICByZXR1cm4ge1xuICAgIGlkOiBwcm90by5pZCxcbiAgICB4OiBwcm90by54LFxuICAgIHk6IHByb3RvLnksXG4gICAgdng6IHByb3RvLnZ4LFxuICAgIHZ5OiBwcm90by52eSxcbiAgICB0OiBwcm90by50LFxuICAgIHNlbGY6IHByb3RvLnNlbGYsXG4gICAgd2F5cG9pbnRzOiBwcm90by53YXlwb2ludHM/Lm1hcCh3cCA9PiAoeyB4OiB3cC54LCB5OiB3cC55LCBzcGVlZDogd3Auc3BlZWQgfSkpLFxuICAgIGN1cnJlbnRXYXlwb2ludEluZGV4OiBwcm90by5jdXJyZW50V2F5cG9pbnRJbmRleCxcbiAgICBocDogcHJvdG8uaHAsXG4gICAga2lsbHM6IHByb3RvLmtpbGxzLFxuICAgIGhlYXQ6IHByb3RvLmhlYXQgPyB7XG4gICAgICB2OiBwcm90by5oZWF0LnYsXG4gICAgICBtOiBwcm90by5oZWF0Lm0sXG4gICAgICB3OiBwcm90by5oZWF0LncsXG4gICAgICBvOiBwcm90by5oZWF0Lm8sXG4gICAgICBtczogcHJvdG8uaGVhdC5tcyxcbiAgICAgIHN1OiBwcm90by5oZWF0LnN1LFxuICAgICAga3U6IHByb3RvLmhlYXQua3UsXG4gICAgICBrZDogcHJvdG8uaGVhdC5rZCxcbiAgICAgIGV4OiBwcm90by5oZWF0LmV4LFxuICAgIH0gOiB1bmRlZmluZWQsXG4gIH07XG59XG5cbi8vIENvbnZlcnQgcHJvdG8gTWlzc2lsZSB0byBNaXNzaWxlU25hcHNob3RcbmV4cG9ydCBmdW5jdGlvbiBwcm90b1RvTWlzc2lsZShwcm90bzogTWlzc2lsZSk6IE1pc3NpbGVTbmFwc2hvdCB7XG4gIHJldHVybiB7XG4gICAgaWQ6IHByb3RvLmlkLFxuICAgIG93bmVyOiBwcm90by5vd25lcixcbiAgICBzZWxmOiBwcm90by5zZWxmLFxuICAgIHg6IHByb3RvLngsXG4gICAgeTogcHJvdG8ueSxcbiAgICB2eDogcHJvdG8udngsXG4gICAgdnk6IHByb3RvLnZ5LFxuICAgIHQ6IHByb3RvLnQsXG4gICAgYWdyb1JhZGl1czogcHJvdG8uYWdyb1JhZGl1cyxcbiAgICBsaWZldGltZTogcHJvdG8ubGlmZXRpbWUsXG4gICAgbGF1bmNoOiBwcm90by5sYXVuY2hUaW1lLFxuICAgIGV4cGlyZXM6IHByb3RvLmV4cGlyZXNBdCxcbiAgICB0YXJnZXRJZDogcHJvdG8udGFyZ2V0SWQgfHwgdW5kZWZpbmVkLFxuICAgIGhlYXQ6IHByb3RvLmhlYXQgPyB7XG4gICAgICB2OiBwcm90by5oZWF0LnYsXG4gICAgICBtOiBwcm90by5oZWF0Lm0sXG4gICAgICB3OiBwcm90by5oZWF0LncsXG4gICAgICBvOiBwcm90by5oZWF0Lm8sXG4gICAgICBtczogcHJvdG8uaGVhdC5tcyxcbiAgICAgIHN1OiBwcm90by5oZWF0LnN1LFxuICAgICAga3U6IHByb3RvLmhlYXQua3UsXG4gICAgICBrZDogcHJvdG8uaGVhdC5rZCxcbiAgICAgIGV4OiBwcm90by5oZWF0LmV4LFxuICAgIH0gOiB1bmRlZmluZWQsXG4gIH07XG59XG5cbi8vIENvbnZlcnQgcHJvdG8gU3RhdGVVcGRhdGUgdG8gQXBwU3RhdGUgZm9ybWF0XG5leHBvcnQgZnVuY3Rpb24gcHJvdG9Ub1N0YXRlKHByb3RvOiBTdGF0ZVVwZGF0ZSkge1xuICBjb25zdCBiYXNlID0ge1xuICAgIG5vdzogcHJvdG8ubm93LFxuICAgIG1lOiBwcm90by5tZSA/IHByb3RvVG9HaG9zdChwcm90by5tZSkgOiBudWxsLFxuICAgIGdob3N0czogcHJvdG8uZ2hvc3RzLm1hcChwcm90b1RvR2hvc3QpLFxuICAgIG1pc3NpbGVzOiBwcm90by5taXNzaWxlcy5tYXAocHJvdG9Ub01pc3NpbGUpLFxuICAgIG1ldGE6IHByb3RvLm1ldGEgPyB7XG4gICAgICBjOiBwcm90by5tZXRhLmMsXG4gICAgICB3OiBwcm90by5tZXRhLncsXG4gICAgICBoOiBwcm90by5tZXRhLmgsXG4gICAgfSA6IHsgYzogMjk5LCB3OiAxNjAwMCwgaDogOTAwMCB9LFxuICAgIG1pc3NpbGVDb25maWc6IHByb3RvLm1pc3NpbGVDb25maWcgPyB7XG4gICAgICBzcGVlZDogcHJvdG8ubWlzc2lsZUNvbmZpZy5zcGVlZCxcbiAgICAgIHNwZWVkTWluOiBwcm90by5taXNzaWxlQ29uZmlnLnNwZWVkTWluLFxuICAgICAgc3BlZWRNYXg6IHByb3RvLm1pc3NpbGVDb25maWcuc3BlZWRNYXgsXG4gICAgICBhZ3JvTWluOiBwcm90by5taXNzaWxlQ29uZmlnLmFncm9NaW4sXG4gICAgICBhZ3JvUmFkaXVzOiBwcm90by5taXNzaWxlQ29uZmlnLmFncm9SYWRpdXMsXG4gICAgICBsaWZldGltZTogcHJvdG8ubWlzc2lsZUNvbmZpZy5saWZldGltZSxcbiAgICAgIGhlYXRDb25maWc6IHByb3RvLm1pc3NpbGVDb25maWcuaGVhdENvbmZpZyA/IHtcbiAgICAgICAgbWF4OiBwcm90by5taXNzaWxlQ29uZmlnLmhlYXRDb25maWcubWF4LFxuICAgICAgICB3YXJuQXQ6IHByb3RvLm1pc3NpbGVDb25maWcuaGVhdENvbmZpZy53YXJuQXQsXG4gICAgICAgIG92ZXJoZWF0QXQ6IHByb3RvLm1pc3NpbGVDb25maWcuaGVhdENvbmZpZy5vdmVyaGVhdEF0LFxuICAgICAgICBtYXJrZXJTcGVlZDogcHJvdG8ubWlzc2lsZUNvbmZpZy5oZWF0Q29uZmlnLm1hcmtlclNwZWVkLFxuICAgICAgICBrVXA6IHByb3RvLm1pc3NpbGVDb25maWcuaGVhdENvbmZpZy5rVXAsXG4gICAgICAgIGtEb3duOiBwcm90by5taXNzaWxlQ29uZmlnLmhlYXRDb25maWcua0Rvd24sXG4gICAgICAgIGV4cDogcHJvdG8ubWlzc2lsZUNvbmZpZy5oZWF0Q29uZmlnLmV4cCxcbiAgICAgIH0gOiB1bmRlZmluZWQsXG4gICAgfSA6IHtcbiAgICAgIHNwZWVkOiAwLFxuICAgICAgc3BlZWRNaW46IDAsXG4gICAgICBzcGVlZE1heDogMCxcbiAgICAgIGFncm9NaW46IDAsXG4gICAgICBhZ3JvUmFkaXVzOiAwLFxuICAgICAgbGlmZXRpbWU6IDAsXG4gICAgfSxcbiAgICBtaXNzaWxlV2F5cG9pbnRzOiBwcm90by5taXNzaWxlV2F5cG9pbnRzLm1hcCh3cCA9PiAoeyB4OiB3cC54LCB5OiB3cC55LCBzcGVlZDogd3Auc3BlZWQgfSkpLFxuICAgIG1pc3NpbGVSb3V0ZXM6IHByb3RvLm1pc3NpbGVSb3V0ZXMubWFwKHIgPT4gKHtcbiAgICAgIGlkOiByLmlkLFxuICAgICAgbmFtZTogci5uYW1lLFxuICAgICAgd2F5cG9pbnRzOiByLndheXBvaW50cy5tYXAod3AgPT4gKHsgeDogd3AueCwgeTogd3AueSwgc3BlZWQ6IHdwLnNwZWVkIH0pKSxcbiAgICB9KSksXG4gICAgYWN0aXZlTWlzc2lsZVJvdXRlOiBwcm90by5hY3RpdmVNaXNzaWxlUm91dGUsXG4gICAgbmV4dE1pc3NpbGVSZWFkeTogcHJvdG8ubmV4dE1pc3NpbGVSZWFkeSxcbiAgfTtcblxuICAvLyBQaGFzZSAyIGFkZGl0aW9uc1xuICByZXR1cm4ge1xuICAgIC4uLmJhc2UsXG4gICAgZGFnOiBwcm90by5kYWcgPyBwcm90b1RvRGFnU3RhdGUocHJvdG8uZGFnKSA6IHVuZGVmaW5lZCxcbiAgICBpbnZlbnRvcnk6IHByb3RvLmludmVudG9yeSA/IHByb3RvVG9JbnZlbnRvcnkocHJvdG8uaW52ZW50b3J5KSA6IHVuZGVmaW5lZCxcbiAgICBzdG9yeTogcHJvdG8uc3RvcnkgPyBwcm90b1RvU3RvcnlTdGF0ZShwcm90by5zdG9yeSkgOiB1bmRlZmluZWQsXG4gICAgY2FwYWJpbGl0aWVzOiBwcm90by5jYXBhYmlsaXRpZXMgPyBwcm90b1RvUGxheWVyQ2FwYWJpbGl0aWVzKHByb3RvLmNhcGFiaWxpdGllcykgOiB1bmRlZmluZWQsXG4gIH07XG59XG5cbi8vID09PT09PT09PT0gUGhhc2UgMjogRW51bSBDb252ZXJ0ZXJzID09PT09PT09PT1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb3RvU3RhdHVzVG9TdHJpbmcoc3RhdHVzOiBEYWdOb2RlU3RhdHVzKTogc3RyaW5nIHtcbiAgc3dpdGNoIChzdGF0dXMpIHtcbiAgICBjYXNlIERhZ05vZGVTdGF0dXMuTE9DS0VEOiByZXR1cm4gJ2xvY2tlZCc7XG4gICAgY2FzZSBEYWdOb2RlU3RhdHVzLkFWQUlMQUJMRTogcmV0dXJuICdhdmFpbGFibGUnO1xuICAgIGNhc2UgRGFnTm9kZVN0YXR1cy5JTl9QUk9HUkVTUzogcmV0dXJuICdpbl9wcm9ncmVzcyc7XG4gICAgY2FzZSBEYWdOb2RlU3RhdHVzLkNPTVBMRVRFRDogcmV0dXJuICdjb21wbGV0ZWQnO1xuICAgIGRlZmF1bHQ6IHJldHVybiAndW5rbm93bic7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb3RvS2luZFRvU3RyaW5nKGtpbmQ6IERhZ05vZGVLaW5kKTogc3RyaW5nIHtcbiAgc3dpdGNoIChraW5kKSB7XG4gICAgY2FzZSBEYWdOb2RlS2luZC5GQUNUT1JZOiByZXR1cm4gJ2ZhY3RvcnknO1xuICAgIGNhc2UgRGFnTm9kZUtpbmQuVU5JVDogcmV0dXJuICd1bml0JztcbiAgICBjYXNlIERhZ05vZGVLaW5kLlNUT1JZOiByZXR1cm4gJ3N0b3J5JztcbiAgICBjYXNlIERhZ05vZGVLaW5kLkNSQUZUOiByZXR1cm4gJ2NyYWZ0JztcbiAgICBkZWZhdWx0OiByZXR1cm4gJ3Vua25vd24nO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm90b0ludGVudFRvU3RyaW5nKGludGVudDogU3RvcnlJbnRlbnQpOiBzdHJpbmcge1xuICBzd2l0Y2ggKGludGVudCkge1xuICAgIGNhc2UgU3RvcnlJbnRlbnQuRkFDVE9SWTogcmV0dXJuICdmYWN0b3J5JztcbiAgICBjYXNlIFN0b3J5SW50ZW50LlVOSVQ6IHJldHVybiAndW5pdCc7XG4gICAgZGVmYXVsdDogcmV0dXJuICcnO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm90b0VmZmVjdFR5cGVUb1N0cmluZyh0eXBlOiBhbnkpOiBzdHJpbmcge1xuICAvLyBNYXAgcHJvdG8gZW51bSB2YWx1ZXMgdG8gc3RyaW5nc1xuICAvLyBUT0RPOiBVc2UgcHJvcGVyIGVudW0gd2hlbiBwcm90byBpcyByZWdlbmVyYXRlZFxuICBjb25zdCB0eXBlTWFwOiBSZWNvcmQ8bnVtYmVyLCBzdHJpbmc+ID0ge1xuICAgIDE6ICdzcGVlZF9tdWx0aXBsaWVyJyxcbiAgICAyOiAnbWlzc2lsZV91bmxvY2snLFxuICAgIDM6ICdoZWF0X2NhcGFjaXR5JyxcbiAgICA0OiAnaGVhdF9lZmZpY2llbmN5JyxcbiAgfTtcbiAgcmV0dXJuIHR5cGVNYXBbdHlwZV0gfHwgJ3Vua25vd24nO1xufVxuXG4vLyA9PT09PT09PT09IFBoYXNlIDI6IFR5cGUgRGVmaW5pdGlvbnMgPT09PT09PT09PVxuXG5leHBvcnQgaW50ZXJmYWNlIFVwZ3JhZGVFZmZlY3REYXRhIHtcbiAgdHlwZTogc3RyaW5nO1xuICB2YWx1ZTogbnVtYmVyIHwgc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIERhZ05vZGVEYXRhIHtcbiAgaWQ6IHN0cmluZztcbiAga2luZDogc3RyaW5nO1xuICBsYWJlbDogc3RyaW5nO1xuICBzdGF0dXM6IHN0cmluZztcbiAgcmVtYWluaW5nUzogbnVtYmVyO1xuICBkdXJhdGlvblM6IG51bWJlcjtcbiAgcmVwZWF0YWJsZTogYm9vbGVhbjtcbiAgZWZmZWN0cz86IFVwZ3JhZGVFZmZlY3REYXRhW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGxheWVyQ2FwYWJpbGl0aWVzRGF0YSB7XG4gIHNwZWVkTXVsdGlwbGllcjogbnVtYmVyO1xuICB1bmxvY2tlZE1pc3NpbGVzOiBzdHJpbmdbXTtcbiAgaGVhdENhcGFjaXR5OiBudW1iZXI7XG4gIGhlYXRFZmZpY2llbmN5OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGFnU3RhdGVEYXRhIHtcbiAgbm9kZXM6IERhZ05vZGVEYXRhW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW52ZW50b3J5SXRlbURhdGEge1xuICB0eXBlOiBzdHJpbmc7XG4gIHZhcmlhbnRJZDogc3RyaW5nO1xuICBoZWF0Q2FwYWNpdHk6IG51bWJlcjtcbiAgcXVhbnRpdHk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJbnZlbnRvcnlEYXRhIHtcbiAgaXRlbXM6IEludmVudG9yeUl0ZW1EYXRhW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcnlEaWFsb2d1ZUNob2ljZURhdGEge1xuICBpZDogc3RyaW5nO1xuICB0ZXh0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcnlUdXRvcmlhbFRpcERhdGEge1xuICB0aXRsZTogc3RyaW5nO1xuICB0ZXh0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcnlEaWFsb2d1ZURhdGEge1xuICBzcGVha2VyOiBzdHJpbmc7XG4gIHRleHQ6IHN0cmluZztcbiAgaW50ZW50OiBzdHJpbmc7XG4gIGNvbnRpbnVlTGFiZWw6IHN0cmluZztcbiAgY2hvaWNlczogU3RvcnlEaWFsb2d1ZUNob2ljZURhdGFbXTtcbiAgdHV0b3JpYWxUaXA/OiBTdG9yeVR1dG9yaWFsVGlwRGF0YTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdG9yeUV2ZW50RGF0YSB7XG4gIGNoYXB0ZXJJZDogc3RyaW5nO1xuICBub2RlSWQ6IHN0cmluZztcbiAgdGltZXN0YW1wOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3RvcnlTdGF0ZURhdGEge1xuICBhY3RpdmVOb2RlOiBzdHJpbmc7XG4gIGRpYWxvZ3VlPzogU3RvcnlEaWFsb2d1ZURhdGE7XG4gIGF2YWlsYWJsZTogc3RyaW5nW107XG4gIGZsYWdzOiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuPjtcbiAgcmVjZW50RXZlbnRzOiBTdG9yeUV2ZW50RGF0YVtdO1xufVxuXG4vLyA9PT09PT09PT09IFBoYXNlIDI6IENvbnZlcnNpb24gRnVuY3Rpb25zID09PT09PT09PT1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb3RvVG9VcGdyYWRlRWZmZWN0KHByb3RvOiBVcGdyYWRlRWZmZWN0KTogVXBncmFkZUVmZmVjdERhdGEge1xuICByZXR1cm4ge1xuICAgIHR5cGU6IHByb3RvRWZmZWN0VHlwZVRvU3RyaW5nKHByb3RvLnR5cGUpLFxuICAgIHZhbHVlOiBwcm90by52YWx1ZS5jYXNlID09PSAnbXVsdGlwbGllcicgPyBwcm90by52YWx1ZS52YWx1ZSA6IHByb3RvLnZhbHVlLnZhbHVlLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvdG9Ub1BsYXllckNhcGFiaWxpdGllcyhwcm90bzogUGxheWVyQ2FwYWJpbGl0aWVzKTogUGxheWVyQ2FwYWJpbGl0aWVzRGF0YSB7XG4gIHJldHVybiB7XG4gICAgc3BlZWRNdWx0aXBsaWVyOiBwcm90by5zcGVlZE11bHRpcGxpZXIsXG4gICAgdW5sb2NrZWRNaXNzaWxlczogcHJvdG8udW5sb2NrZWRNaXNzaWxlcyxcbiAgICBoZWF0Q2FwYWNpdHk6IHByb3RvLmhlYXRDYXBhY2l0eSxcbiAgICBoZWF0RWZmaWNpZW5jeTogcHJvdG8uaGVhdEVmZmljaWVuY3ksXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm90b1RvRGFnTm9kZShwcm90bzogRGFnTm9kZSk6IERhZ05vZGVEYXRhIHtcbiAgcmV0dXJuIHtcbiAgICBpZDogcHJvdG8uaWQsXG4gICAga2luZDogcHJvdG9LaW5kVG9TdHJpbmcocHJvdG8ua2luZCksXG4gICAgbGFiZWw6IHByb3RvLmxhYmVsLFxuICAgIHN0YXR1czogcHJvdG9TdGF0dXNUb1N0cmluZyhwcm90by5zdGF0dXMpLFxuICAgIHJlbWFpbmluZ1M6IHByb3RvLnJlbWFpbmluZ1MsXG4gICAgZHVyYXRpb25TOiBwcm90by5kdXJhdGlvblMsXG4gICAgcmVwZWF0YWJsZTogcHJvdG8ucmVwZWF0YWJsZSxcbiAgICBlZmZlY3RzOiBwcm90by5lZmZlY3RzPy5tYXAocHJvdG9Ub1VwZ3JhZGVFZmZlY3QpIHx8IFtdLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvdG9Ub0RhZ1N0YXRlKHByb3RvOiBEYWdTdGF0ZSk6IERhZ1N0YXRlRGF0YSB7XG4gIHJldHVybiB7XG4gICAgbm9kZXM6IHByb3RvLm5vZGVzLm1hcChwcm90b1RvRGFnTm9kZSksXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm90b1RvSW52ZW50b3J5SXRlbShwcm90bzogSW52ZW50b3J5SXRlbSk6IEludmVudG9yeUl0ZW1EYXRhIHtcbiAgcmV0dXJuIHtcbiAgICB0eXBlOiBwcm90by50eXBlLFxuICAgIHZhcmlhbnRJZDogcHJvdG8udmFyaWFudElkLFxuICAgIGhlYXRDYXBhY2l0eTogcHJvdG8uaGVhdENhcGFjaXR5LFxuICAgIHF1YW50aXR5OiBwcm90by5xdWFudGl0eSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb3RvVG9JbnZlbnRvcnkocHJvdG86IEludmVudG9yeSk6IEludmVudG9yeURhdGEge1xuICByZXR1cm4ge1xuICAgIGl0ZW1zOiBwcm90by5pdGVtcy5tYXAocHJvdG9Ub0ludmVudG9yeUl0ZW0pLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvdG9Ub1N0b3J5RGlhbG9ndWUocHJvdG86IFN0b3J5RGlhbG9ndWUpOiBTdG9yeURpYWxvZ3VlRGF0YSB7XG4gIHJldHVybiB7XG4gICAgc3BlYWtlcjogcHJvdG8uc3BlYWtlcixcbiAgICB0ZXh0OiBwcm90by50ZXh0LFxuICAgIGludGVudDogcHJvdG9JbnRlbnRUb1N0cmluZyhwcm90by5pbnRlbnQpLFxuICAgIGNvbnRpbnVlTGFiZWw6IHByb3RvLmNvbnRpbnVlTGFiZWwsXG4gICAgY2hvaWNlczogcHJvdG8uY2hvaWNlcy5tYXAoYyA9PiAoeyBpZDogYy5pZCwgdGV4dDogYy50ZXh0IH0pKSxcbiAgICB0dXRvcmlhbFRpcDogcHJvdG8udHV0b3JpYWxUaXAgPyB7XG4gICAgICB0aXRsZTogcHJvdG8udHV0b3JpYWxUaXAudGl0bGUsXG4gICAgICB0ZXh0OiBwcm90by50dXRvcmlhbFRpcC50ZXh0LFxuICAgIH0gOiB1bmRlZmluZWQsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm90b1RvU3RvcnlTdGF0ZShwcm90bzogU3RvcnlTdGF0ZSk6IFN0b3J5U3RhdGVEYXRhIHtcbiAgcmV0dXJuIHtcbiAgICBhY3RpdmVOb2RlOiBwcm90by5hY3RpdmVOb2RlLFxuICAgIGRpYWxvZ3VlOiBwcm90by5kaWFsb2d1ZSA/IHByb3RvVG9TdG9yeURpYWxvZ3VlKHByb3RvLmRpYWxvZ3VlKSA6IHVuZGVmaW5lZCxcbiAgICBhdmFpbGFibGU6IHByb3RvLmF2YWlsYWJsZSxcbiAgICBmbGFnczogcHJvdG8uZmxhZ3MsXG4gICAgcmVjZW50RXZlbnRzOiBwcm90by5yZWNlbnRFdmVudHMubWFwKGUgPT4gKHtcbiAgICAgIGNoYXB0ZXJJZDogZS5jaGFwdGVySWQsXG4gICAgICBub2RlSWQ6IGUubm9kZUlkLFxuICAgICAgdGltZXN0YW1wOiBlLnRpbWVzdGFtcCxcbiAgICB9KSksXG4gIH07XG59XG4iLCAiaW1wb3J0IHsgdHlwZSBFdmVudEJ1cyB9IGZyb20gXCIuL2J1c1wiO1xuaW1wb3J0IHtcbiAgdHlwZSBBcHBTdGF0ZSxcbiAgdHlwZSBNaXNzaWxlUm91dGUsXG4gIG1vbm90b25pY05vdyxcbiAgc2FuaXRpemVNaXNzaWxlQ29uZmlnLFxuICB1cGRhdGVNaXNzaWxlTGltaXRzLFxufSBmcm9tIFwiLi9zdGF0ZVwiO1xuaW1wb3J0IHR5cGUgeyBEaWFsb2d1ZUNvbnRlbnQgfSBmcm9tIFwiLi9zdG9yeS90eXBlc1wiO1xuaW1wb3J0IHsgY3JlYXRlLCB0b0JpbmFyeSwgZnJvbUJpbmFyeSB9IGZyb20gXCJAYnVmYnVpbGQvcHJvdG9idWZcIjtcbmltcG9ydCB7IFdzRW52ZWxvcGVTY2hlbWEsIHR5cGUgV3NFbnZlbG9wZSB9IGZyb20gXCIuL3Byb3RvL3Byb3RvL3dzX21lc3NhZ2VzX3BiXCI7XG5pbXBvcnQgeyBwcm90b1RvU3RhdGUsIHByb3RvVG9EYWdTdGF0ZSB9IGZyb20gXCIuL3Byb3RvX2hlbHBlcnNcIjtcblxuaW50ZXJmYWNlIENvbm5lY3RPcHRpb25zIHtcbiAgcm9vbTogc3RyaW5nO1xuICBzdGF0ZTogQXBwU3RhdGU7XG4gIGJ1czogRXZlbnRCdXM7XG4gIG9uU3RhdGVVcGRhdGVkPzogKCkgPT4gdm9pZDtcbiAgb25PcGVuPzogKHNvY2tldDogV2ViU29ja2V0KSA9PiB2b2lkO1xuICBtYXBXPzogbnVtYmVyO1xuICBtYXBIPzogbnVtYmVyO1xuICBtb2RlPzogc3RyaW5nO1xuICBtaXNzaW9uSWQ/OiBzdHJpbmc7XG59XG5cbmxldCB3czogV2ViU29ja2V0IHwgbnVsbCA9IG51bGw7XG5cbi8vIEhlbHBlciB0byBzZW5kIHByb3RvYnVmIG1lc3NhZ2VzXG5mdW5jdGlvbiBzZW5kUHJvdG8oZW52ZWxvcGU6IFdzRW52ZWxvcGUpIHtcbiAgaWYgKCF3cyB8fCB3cy5yZWFkeVN0YXRlICE9PSBXZWJTb2NrZXQuT1BFTikgcmV0dXJuO1xuICBjb25zdCBieXRlcyA9IHRvQmluYXJ5KFdzRW52ZWxvcGVTY2hlbWEsIGVudmVsb3BlKTtcbiAgd3Muc2VuZChieXRlcyk7XG59XG5cbi8vIExlZ2FjeSBKU09OIG1lc3NhZ2Ugc2VuZGVyIChrZXB0IGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5IGFuZCBEQUcgbWVzc2FnZXMpXG5leHBvcnQgZnVuY3Rpb24gc2VuZE1lc3NhZ2UocGF5bG9hZDogdW5rbm93bik6IHZvaWQge1xuICBpZiAoIXdzIHx8IHdzLnJlYWR5U3RhdGUgIT09IFdlYlNvY2tldC5PUEVOKSByZXR1cm47XG5cbiAgLy8gSWYgcGF5bG9hZCBoYXMgYSBcInR5cGVcIiBmaWVsZCwgY29udmVydCB0byBwcm90b2J1ZlxuICBpZiAodHlwZW9mIHBheWxvYWQgPT09IFwib2JqZWN0XCIgJiYgcGF5bG9hZCAhPT0gbnVsbCAmJiBcInR5cGVcIiBpbiBwYXlsb2FkKSB7XG4gICAgY29uc3QgbXNnID0gcGF5bG9hZCBhcyBhbnk7XG5cbiAgICAvLyBDb252ZXJ0IGNvbW1vbiBtZXNzYWdlIHR5cGVzIHRvIHByb3RvYnVmXG4gICAgc3dpdGNoIChtc2cudHlwZSkge1xuICAgICAgY2FzZSBcImpvaW5cIjpcbiAgICAgICAgc2VuZFByb3RvKGNyZWF0ZShXc0VudmVsb3BlU2NoZW1hLCB7XG4gICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgY2FzZTogXCJqb2luXCIsXG4gICAgICAgICAgICB2YWx1ZToge1xuICAgICAgICAgICAgICBuYW1lOiBtc2cubmFtZSB8fCBcIlwiLFxuICAgICAgICAgICAgICByb29tOiBtc2cucm9vbSB8fCBcIlwiLFxuICAgICAgICAgICAgICBtYXBXOiBtc2cubWFwX3cgfHwgMCxcbiAgICAgICAgICAgICAgbWFwSDogbXNnLm1hcF9oIHx8IDAsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pKTtcbiAgICAgICAgcmV0dXJuO1xuXG4gICAgICBjYXNlIFwic3Bhd25fYm90XCI6XG4gICAgICAgIHNlbmRQcm90byhjcmVhdGUoV3NFbnZlbG9wZVNjaGVtYSwge1xuICAgICAgICAgIHBheWxvYWQ6IHsgY2FzZTogXCJzcGF3bkJvdFwiLCB2YWx1ZToge30gfSxcbiAgICAgICAgfSkpO1xuICAgICAgICByZXR1cm47XG5cbiAgICAgIGNhc2UgXCJhZGRfd2F5cG9pbnRcIjpcbiAgICAgICAgc2VuZFByb3RvKGNyZWF0ZShXc0VudmVsb3BlU2NoZW1hLCB7XG4gICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgY2FzZTogXCJhZGRXYXlwb2ludFwiLFxuICAgICAgICAgICAgdmFsdWU6IHsgeDogbXNnLngsIHk6IG1zZy55LCBzcGVlZDogbXNnLnNwZWVkIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSkpO1xuICAgICAgICByZXR1cm47XG5cbiAgICAgIGNhc2UgXCJ1cGRhdGVfd2F5cG9pbnRcIjpcbiAgICAgICAgc2VuZFByb3RvKGNyZWF0ZShXc0VudmVsb3BlU2NoZW1hLCB7XG4gICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgY2FzZTogXCJ1cGRhdGVXYXlwb2ludFwiLFxuICAgICAgICAgICAgdmFsdWU6IHsgaW5kZXg6IG1zZy5pbmRleCwgc3BlZWQ6IG1zZy5zcGVlZCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pKTtcbiAgICAgICAgcmV0dXJuO1xuXG4gICAgICBjYXNlIFwibW92ZV93YXlwb2ludFwiOlxuICAgICAgICBzZW5kUHJvdG8oY3JlYXRlKFdzRW52ZWxvcGVTY2hlbWEsIHtcbiAgICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgICBjYXNlOiBcIm1vdmVXYXlwb2ludFwiLFxuICAgICAgICAgICAgdmFsdWU6IHsgaW5kZXg6IG1zZy5pbmRleCwgeDogbXNnLngsIHk6IG1zZy55IH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSkpO1xuICAgICAgICByZXR1cm47XG5cbiAgICAgIGNhc2UgXCJkZWxldGVfd2F5cG9pbnRcIjpcbiAgICAgICAgc2VuZFByb3RvKGNyZWF0ZShXc0VudmVsb3BlU2NoZW1hLCB7XG4gICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgY2FzZTogXCJkZWxldGVXYXlwb2ludFwiLFxuICAgICAgICAgICAgdmFsdWU6IHsgaW5kZXg6IG1zZy5pbmRleCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pKTtcbiAgICAgICAgcmV0dXJuO1xuXG4gICAgICBjYXNlIFwiY2xlYXJfd2F5cG9pbnRzXCI6XG4gICAgICAgIHNlbmRQcm90byhjcmVhdGUoV3NFbnZlbG9wZVNjaGVtYSwge1xuICAgICAgICAgIHBheWxvYWQ6IHsgY2FzZTogXCJjbGVhcldheXBvaW50c1wiLCB2YWx1ZToge30gfSxcbiAgICAgICAgfSkpO1xuICAgICAgICByZXR1cm47XG5cbiAgICAgIGNhc2UgXCJjb25maWd1cmVfbWlzc2lsZVwiOlxuICAgICAgICBzZW5kUHJvdG8oY3JlYXRlKFdzRW52ZWxvcGVTY2hlbWEsIHtcbiAgICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgICBjYXNlOiBcImNvbmZpZ3VyZU1pc3NpbGVcIixcbiAgICAgICAgICAgIHZhbHVlOiB7IG1pc3NpbGVTcGVlZDogbXNnLm1pc3NpbGVfc3BlZWQsIG1pc3NpbGVBZ3JvOiBtc2cubWlzc2lsZV9hZ3JvIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSkpO1xuICAgICAgICByZXR1cm47XG5cbiAgICAgIGNhc2UgXCJsYXVuY2hfbWlzc2lsZVwiOlxuICAgICAgICBzZW5kUHJvdG8oY3JlYXRlKFdzRW52ZWxvcGVTY2hlbWEsIHtcbiAgICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgICBjYXNlOiBcImxhdW5jaE1pc3NpbGVcIixcbiAgICAgICAgICAgIHZhbHVlOiB7IHJvdXRlSWQ6IG1zZy5yb3V0ZV9pZCB8fCBcIlwiIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSkpO1xuICAgICAgICByZXR1cm47XG5cbiAgICAgIGNhc2UgXCJhZGRfbWlzc2lsZV93YXlwb2ludFwiOlxuICAgICAgICBzZW5kUHJvdG8oY3JlYXRlKFdzRW52ZWxvcGVTY2hlbWEsIHtcbiAgICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgICBjYXNlOiBcImFkZE1pc3NpbGVXYXlwb2ludFwiLFxuICAgICAgICAgICAgdmFsdWU6IHsgcm91dGVJZDogbXNnLnJvdXRlX2lkIHx8IFwiXCIsIHg6IG1zZy54LCB5OiBtc2cueSwgc3BlZWQ6IG1zZy5zcGVlZCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pKTtcbiAgICAgICAgcmV0dXJuO1xuXG4gICAgICBjYXNlIFwidXBkYXRlX21pc3NpbGVfd2F5cG9pbnRfc3BlZWRcIjpcbiAgICAgICAgc2VuZFByb3RvKGNyZWF0ZShXc0VudmVsb3BlU2NoZW1hLCB7XG4gICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgY2FzZTogXCJ1cGRhdGVNaXNzaWxlV2F5cG9pbnRTcGVlZFwiLFxuICAgICAgICAgICAgdmFsdWU6IHsgcm91dGVJZDogbXNnLnJvdXRlX2lkIHx8IFwiXCIsIGluZGV4OiBtc2cuaW5kZXgsIHNwZWVkOiBtc2cuc3BlZWQgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KSk7XG4gICAgICAgIHJldHVybjtcblxuICAgICAgY2FzZSBcIm1vdmVfbWlzc2lsZV93YXlwb2ludFwiOlxuICAgICAgICBzZW5kUHJvdG8oY3JlYXRlKFdzRW52ZWxvcGVTY2hlbWEsIHtcbiAgICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgICBjYXNlOiBcIm1vdmVNaXNzaWxlV2F5cG9pbnRcIixcbiAgICAgICAgICAgIHZhbHVlOiB7IHJvdXRlSWQ6IG1zZy5yb3V0ZV9pZCB8fCBcIlwiLCBpbmRleDogbXNnLmluZGV4LCB4OiBtc2cueCwgeTogbXNnLnkgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KSk7XG4gICAgICAgIHJldHVybjtcblxuICAgICAgY2FzZSBcImRlbGV0ZV9taXNzaWxlX3dheXBvaW50XCI6XG4gICAgICAgIHNlbmRQcm90byhjcmVhdGUoV3NFbnZlbG9wZVNjaGVtYSwge1xuICAgICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICAgIGNhc2U6IFwiZGVsZXRlTWlzc2lsZVdheXBvaW50XCIsXG4gICAgICAgICAgICB2YWx1ZTogeyByb3V0ZUlkOiBtc2cucm91dGVfaWQgfHwgXCJcIiwgaW5kZXg6IG1zZy5pbmRleCB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pKTtcbiAgICAgICAgcmV0dXJuO1xuXG4gICAgICBjYXNlIFwiY2xlYXJfbWlzc2lsZV9yb3V0ZVwiOlxuICAgICAgICBzZW5kUHJvdG8oY3JlYXRlKFdzRW52ZWxvcGVTY2hlbWEsIHtcbiAgICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgICBjYXNlOiBcImNsZWFyTWlzc2lsZVJvdXRlXCIsXG4gICAgICAgICAgICB2YWx1ZTogeyByb3V0ZUlkOiBtc2cucm91dGVfaWQgfHwgXCJcIiB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pKTtcbiAgICAgICAgcmV0dXJuO1xuXG4gICAgICBjYXNlIFwiYWRkX21pc3NpbGVfcm91dGVcIjpcbiAgICAgICAgc2VuZFByb3RvKGNyZWF0ZShXc0VudmVsb3BlU2NoZW1hLCB7XG4gICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgY2FzZTogXCJhZGRNaXNzaWxlUm91dGVcIixcbiAgICAgICAgICAgIHZhbHVlOiB7IG5hbWU6IG1zZy5uYW1lIHx8IFwiXCIgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KSk7XG4gICAgICAgIHJldHVybjtcblxuICAgICAgY2FzZSBcInJlbmFtZV9taXNzaWxlX3JvdXRlXCI6XG4gICAgICAgIHNlbmRQcm90byhjcmVhdGUoV3NFbnZlbG9wZVNjaGVtYSwge1xuICAgICAgICAgIHBheWxvYWQ6IHtcbiAgICAgICAgICAgIGNhc2U6IFwicmVuYW1lTWlzc2lsZVJvdXRlXCIsXG4gICAgICAgICAgICB2YWx1ZTogeyByb3V0ZUlkOiBtc2cucm91dGVfaWQgfHwgXCJcIiwgbmFtZTogbXNnLm5hbWUgfHwgXCJcIiB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pKTtcbiAgICAgICAgcmV0dXJuO1xuXG4gICAgICBjYXNlIFwiZGVsZXRlX21pc3NpbGVfcm91dGVcIjpcbiAgICAgICAgc2VuZFByb3RvKGNyZWF0ZShXc0VudmVsb3BlU2NoZW1hLCB7XG4gICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgY2FzZTogXCJkZWxldGVNaXNzaWxlUm91dGVcIixcbiAgICAgICAgICAgIHZhbHVlOiB7IHJvdXRlSWQ6IG1zZy5yb3V0ZV9pZCB8fCBcIlwiIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSkpO1xuICAgICAgICByZXR1cm47XG5cbiAgICAgIGNhc2UgXCJzZXRfYWN0aXZlX21pc3NpbGVfcm91dGVcIjpcbiAgICAgICAgc2VuZFByb3RvKGNyZWF0ZShXc0VudmVsb3BlU2NoZW1hLCB7XG4gICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgY2FzZTogXCJzZXRBY3RpdmVNaXNzaWxlUm91dGVcIixcbiAgICAgICAgICAgIHZhbHVlOiB7IHJvdXRlSWQ6IG1zZy5yb3V0ZV9pZCB8fCBcIlwiIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSkpO1xuICAgICAgICByZXR1cm47XG5cbiAgICAgIGNhc2UgXCJkYWdfc3RhcnRcIjpcbiAgICAgICAgc2VuZFByb3RvKGNyZWF0ZShXc0VudmVsb3BlU2NoZW1hLCB7XG4gICAgICAgICAgcGF5bG9hZDoge1xuICAgICAgICAgICAgY2FzZTogXCJkYWdTdGFydFwiLFxuICAgICAgICAgICAgdmFsdWU6IHsgbm9kZUlkOiBtc2cubm9kZV9pZCB8fCBcIlwiIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSkpO1xuICAgICAgICByZXR1cm47XG5cbiAgICAgIGNhc2UgXCJjbGVhcl9taXNzaWxlX3dheXBvaW50c1wiOlxuICAgICAgICBzZW5kUHJvdG8oY3JlYXRlKFdzRW52ZWxvcGVTY2hlbWEsIHtcbiAgICAgICAgICBwYXlsb2FkOiB7XG4gICAgICAgICAgICBjYXNlOiBcImNsZWFyTWlzc2lsZVdheXBvaW50c1wiLFxuICAgICAgICAgICAgdmFsdWU6IHsgcm91dGVJZDogbXNnLnJvdXRlX2lkIHx8IFwiXCIgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KSk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gIH1cbn1cblxuLy8gPT09PT09PT09PSBQaGFzZSAyOiBEQUcgQ29tbWFuZCBGdW5jdGlvbnMgPT09PT09PT09PVxuXG5leHBvcnQgZnVuY3Rpb24gc2VuZERhZ1N0YXJ0KG5vZGVJZDogc3RyaW5nKTogdm9pZCB7XG4gIGlmICghd3MgfHwgd3MucmVhZHlTdGF0ZSAhPT0gV2ViU29ja2V0Lk9QRU4pIHJldHVybjtcbiAgc2VuZFByb3RvKGNyZWF0ZShXc0VudmVsb3BlU2NoZW1hLCB7XG4gICAgcGF5bG9hZDoge1xuICAgICAgY2FzZTogXCJkYWdTdGFydFwiLFxuICAgICAgdmFsdWU6IHsgbm9kZUlkIH0sXG4gICAgfSxcbiAgfSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2VuZERhZ0NhbmNlbChub2RlSWQ6IHN0cmluZyk6IHZvaWQge1xuICBpZiAoIXdzIHx8IHdzLnJlYWR5U3RhdGUgIT09IFdlYlNvY2tldC5PUEVOKSByZXR1cm47XG4gIHNlbmRQcm90byhjcmVhdGUoV3NFbnZlbG9wZVNjaGVtYSwge1xuICAgIHBheWxvYWQ6IHtcbiAgICAgIGNhc2U6IFwiZGFnQ2FuY2VsXCIsXG4gICAgICB2YWx1ZTogeyBub2RlSWQgfSxcbiAgICB9LFxuICB9KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZW5kRGFnU3RvcnlBY2sobm9kZUlkOiBzdHJpbmcsIGNob2ljZUlkOiBzdHJpbmcgPSBcIlwiKTogdm9pZCB7XG4gIGlmICghd3MgfHwgd3MucmVhZHlTdGF0ZSAhPT0gV2ViU29ja2V0Lk9QRU4pIHJldHVybjtcbiAgc2VuZFByb3RvKGNyZWF0ZShXc0VudmVsb3BlU2NoZW1hLCB7XG4gICAgcGF5bG9hZDoge1xuICAgICAgY2FzZTogXCJkYWdTdG9yeUFja1wiLFxuICAgICAgdmFsdWU6IHsgbm9kZUlkLCBjaG9pY2VJZCB9LFxuICAgIH0sXG4gIH0pKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNlbmREYWdMaXN0KCk6IHZvaWQge1xuICBpZiAoIXdzIHx8IHdzLnJlYWR5U3RhdGUgIT09IFdlYlNvY2tldC5PUEVOKSByZXR1cm47XG4gIHNlbmRQcm90byhjcmVhdGUoV3NFbnZlbG9wZVNjaGVtYSwge1xuICAgIHBheWxvYWQ6IHtcbiAgICAgIGNhc2U6IFwiZGFnTGlzdFwiLFxuICAgICAgdmFsdWU6IHt9LFxuICAgIH0sXG4gIH0pKTtcbn1cblxuLy8gPT09PT09PT09PSBQaGFzZSAyOiBNaXNzaW9uIEV2ZW50IEZ1bmN0aW9ucyA9PT09PT09PT09XG5cbmV4cG9ydCBmdW5jdGlvbiBzZW5kTWlzc2lvblNwYXduV2F2ZSh3YXZlSW5kZXg6IG51bWJlcik6IHZvaWQge1xuICBpZiAoIXdzIHx8IHdzLnJlYWR5U3RhdGUgIT09IFdlYlNvY2tldC5PUEVOKSByZXR1cm47XG4gIHNlbmRQcm90byhjcmVhdGUoV3NFbnZlbG9wZVNjaGVtYSwge1xuICAgIHBheWxvYWQ6IHtcbiAgICAgIGNhc2U6IFwibWlzc2lvblNwYXduV2F2ZVwiLFxuICAgICAgdmFsdWU6IHsgd2F2ZUluZGV4IH0sXG4gICAgfSxcbiAgfSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2VuZE1pc3Npb25TdG9yeUV2ZW50KGV2ZW50OiBzdHJpbmcsIGJlYWNvbjogbnVtYmVyID0gMCk6IHZvaWQge1xuICBpZiAoIXdzIHx8IHdzLnJlYWR5U3RhdGUgIT09IFdlYlNvY2tldC5PUEVOKSByZXR1cm47XG4gIHNlbmRQcm90byhjcmVhdGUoV3NFbnZlbG9wZVNjaGVtYSwge1xuICAgIHBheWxvYWQ6IHtcbiAgICAgIGNhc2U6IFwibWlzc2lvblN0b3J5RXZlbnRcIixcbiAgICAgIHZhbHVlOiB7IGV2ZW50LCBiZWFjb24gfSxcbiAgICB9LFxuICB9KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb25uZWN0V2ViU29ja2V0KHtcbiAgcm9vbSxcbiAgc3RhdGUsXG4gIGJ1cyxcbiAgb25TdGF0ZVVwZGF0ZWQsXG4gIG9uT3BlbixcbiAgbWFwVyxcbiAgbWFwSCxcbiAgbW9kZSxcbiAgbWlzc2lvbklkLFxufTogQ29ubmVjdE9wdGlvbnMpOiB2b2lkIHtcbiAgY29uc3QgcHJvdG9jb2wgPSB3aW5kb3cubG9jYXRpb24ucHJvdG9jb2wgPT09IFwiaHR0cHM6XCIgPyBcIndzczovL1wiIDogXCJ3czovL1wiO1xuICBsZXQgd3NVcmwgPSBgJHtwcm90b2NvbH0ke3dpbmRvdy5sb2NhdGlvbi5ob3N0fS93cz9yb29tPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHJvb20pfWA7XG4gIGlmIChtYXBXICYmIG1hcFcgPiAwKSB7XG4gICAgd3NVcmwgKz0gYCZtYXBXPSR7bWFwV31gO1xuICB9XG4gIGlmIChtYXBIICYmIG1hcEggPiAwKSB7XG4gICAgd3NVcmwgKz0gYCZtYXBIPSR7bWFwSH1gO1xuICB9XG4gIGlmIChtb2RlKSB7XG4gICAgd3NVcmwgKz0gYCZtb2RlPSR7ZW5jb2RlVVJJQ29tcG9uZW50KG1vZGUpfWA7XG4gIH1cbiAgaWYgKG1pc3Npb25JZCkge1xuICAgIHdzVXJsICs9IGAmbWlzc2lvbj0ke2VuY29kZVVSSUNvbXBvbmVudChtaXNzaW9uSWQpfWA7XG4gIH1cbiAgd3MgPSBuZXcgV2ViU29ja2V0KHdzVXJsKTtcbiAgLy8gU2V0IGJpbmFyeSB0eXBlIGZvciBwcm90b2J1ZiBtZXNzYWdlc1xuICB3cy5iaW5hcnlUeXBlID0gXCJhcnJheWJ1ZmZlclwiO1xuICB3cy5hZGRFdmVudExpc3RlbmVyKFwib3BlblwiLCAoKSA9PiB7XG4gICAgY29uc29sZS5sb2coXCJbd3NdIG9wZW5cIik7XG4gICAgY29uc3Qgc29ja2V0ID0gd3M7XG4gICAgaWYgKHNvY2tldCAmJiBvbk9wZW4pIHtcbiAgICAgIG9uT3Blbihzb2NrZXQpO1xuICAgIH1cbiAgfSk7XG4gIHdzLmFkZEV2ZW50TGlzdGVuZXIoXCJjbG9zZVwiLCAoKSA9PiBjb25zb2xlLmxvZyhcIlt3c10gY2xvc2VcIikpO1xuXG4gIGxldCBwcmV2Um91dGVzID0gbmV3IE1hcDxzdHJpbmcsIE1pc3NpbGVSb3V0ZT4oKTtcbiAgbGV0IHByZXZBY3RpdmVSb3V0ZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGxldCBwcmV2TWlzc2lsZUNvdW50ID0gMDtcblxuICB3cy5hZGRFdmVudExpc3RlbmVyKFwibWVzc2FnZVwiLCAoZXZlbnQpID0+IHtcbiAgICAvLyBIYW5kbGUgYmluYXJ5IHByb3RvYnVmIG1lc3NhZ2VzXG4gICAgaWYgKGV2ZW50LmRhdGEgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgZW52ZWxvcGUgPSBmcm9tQmluYXJ5KFdzRW52ZWxvcGVTY2hlbWEsIG5ldyBVaW50OEFycmF5KGV2ZW50LmRhdGEpKTtcblxuICAgICAgICBpZiAoZW52ZWxvcGUucGF5bG9hZC5jYXNlID09PSBcInN0YXRlVXBkYXRlXCIpIHtcbiAgICAgICAgICBjb25zdCBwcm90b1N0YXRlID0gcHJvdG9Ub1N0YXRlKGVudmVsb3BlLnBheWxvYWQudmFsdWUpO1xuICAgICAgICAgIGhhbmRsZVByb3RvU3RhdGVNZXNzYWdlKHN0YXRlLCBwcm90b1N0YXRlLCBidXMsIHByZXZSb3V0ZXMsIHByZXZBY3RpdmVSb3V0ZSwgcHJldk1pc3NpbGVDb3VudCk7XG4gICAgICAgICAgcHJldlJvdXRlcyA9IG5ldyBNYXAoc3RhdGUubWlzc2lsZVJvdXRlcy5tYXAoKHJvdXRlKSA9PiBbcm91dGUuaWQsIGNsb25lUm91dGUocm91dGUpXSkpO1xuICAgICAgICAgIHByZXZBY3RpdmVSb3V0ZSA9IHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkO1xuICAgICAgICAgIHByZXZNaXNzaWxlQ291bnQgPSBzdGF0ZS5taXNzaWxlcy5sZW5ndGg7XG4gICAgICAgICAgYnVzLmVtaXQoXCJzdGF0ZTp1cGRhdGVkXCIpO1xuICAgICAgICAgIG9uU3RhdGVVcGRhdGVkPy4oKTtcbiAgICAgICAgfSBlbHNlIGlmIChlbnZlbG9wZS5wYXlsb2FkLmNhc2UgPT09IFwicm9vbUZ1bGxcIikge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJbd3NdIFJvb20gZnVsbDpcIiwgZW52ZWxvcGUucGF5bG9hZC52YWx1ZS5tZXNzYWdlKTtcbiAgICAgICAgICBidXMuZW1pdChcImNvbm5lY3Rpb246ZXJyb3JcIiwgeyBtZXNzYWdlOiBlbnZlbG9wZS5wYXlsb2FkLnZhbHVlLm1lc3NhZ2UgfSk7XG4gICAgICAgIH0gZWxzZSBpZiAoZW52ZWxvcGUucGF5bG9hZC5jYXNlID09PSBcImRhZ0xpc3RSZXNwb25zZVwiKSB7XG4gICAgICAgICAgLy8gSGFuZGxlIERBRyBsaXN0IHJlc3BvbnNlIGZyb20gUGhhc2UgMlxuICAgICAgICAgIGNvbnN0IGRhZ0RhdGEgPSBlbnZlbG9wZS5wYXlsb2FkLnZhbHVlLmRhZztcbiAgICAgICAgICBpZiAoZGFnRGF0YSkge1xuICAgICAgICAgICAgYnVzLmVtaXQoXCJkYWc6bGlzdFwiLCBwcm90b1RvRGFnU3RhdGUoZGFnRGF0YSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zb2xlLndhcm4oXCJbd3NdIFVua25vd24gcHJvdG9idWYgbWVzc2FnZSB0eXBlOlwiLCBlbnZlbG9wZS5wYXlsb2FkLmNhc2UpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIlt3c10gRmFpbGVkIHRvIGRlY29kZSBwcm90b2J1ZiBtZXNzYWdlOlwiLCBlcnIpO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgfSk7XG59XG5cblxuLy8gSGFuZGxlIHByb3RvYnVmIHN0YXRlIG1lc3NhZ2VzIChzaW1wbGlmaWVkIHZlcnNpb24gb2YgaGFuZGxlU3RhdGVNZXNzYWdlKVxuZnVuY3Rpb24gaGFuZGxlUHJvdG9TdGF0ZU1lc3NhZ2UoXG4gIHN0YXRlOiBBcHBTdGF0ZSxcbiAgbXNnOiBSZXR1cm5UeXBlPHR5cGVvZiBwcm90b1RvU3RhdGU+LFxuICBidXM6IEV2ZW50QnVzLFxuICBwcmV2Um91dGVzOiBNYXA8c3RyaW5nLCBNaXNzaWxlUm91dGU+LFxuICBwcmV2QWN0aXZlUm91dGU6IHN0cmluZyB8IG51bGwsXG4gIHByZXZNaXNzaWxlQ291bnQ6IG51bWJlcixcbik6IHZvaWQge1xuICBzdGF0ZS5ub3cgPSBtc2cubm93O1xuICBzdGF0ZS5ub3dTeW5jZWRBdCA9IG1vbm90b25pY05vdygpO1xuICBzdGF0ZS5uZXh0TWlzc2lsZVJlYWR5QXQgPSBtc2cubmV4dE1pc3NpbGVSZWFkeTtcblxuICAvLyBVcGRhdGUgcGxheWVyIHNoaXBcbiAgaWYgKG1zZy5tZSkge1xuICAgIHN0YXRlLm1lID0ge1xuICAgICAgeDogbXNnLm1lLngsXG4gICAgICB5OiBtc2cubWUueSxcbiAgICAgIHZ4OiBtc2cubWUudngsXG4gICAgICB2eTogbXNnLm1lLnZ5LFxuICAgICAgaHA6IG1zZy5tZS5ocCxcbiAgICAgIGtpbGxzOiBtc2cubWUua2lsbHMsXG4gICAgICB3YXlwb2ludHM6IG1zZy5tZS53YXlwb2ludHMgPz8gW10sXG4gICAgICBjdXJyZW50V2F5cG9pbnRJbmRleDogbXNnLm1lLmN1cnJlbnRXYXlwb2ludEluZGV4ID8/IDAsXG4gICAgICBoZWF0OiBtc2cubWUuaGVhdCA/IGNvbnZlcnRIZWF0Vmlldyhtc2cubWUuaGVhdCwgc3RhdGUubm93U3luY2VkQXQsIHN0YXRlLm5vdykgOiB1bmRlZmluZWQsXG4gICAgfTtcbiAgfSBlbHNlIHtcbiAgICBzdGF0ZS5tZSA9IG51bGw7XG4gIH1cblxuICAvLyBVcGRhdGUgZ2hvc3RzIGFuZCBtaXNzaWxlcyAoYWxyZWFkeSBpbiBjb3JyZWN0IGZvcm1hdCBmcm9tIHByb3RvX2hlbHBlcnMpXG4gIHN0YXRlLmdob3N0cyA9IG1zZy5naG9zdHM7XG4gIHN0YXRlLm1pc3NpbGVzID0gbXNnLm1pc3NpbGVzO1xuXG4gIC8vIFVwZGF0ZSBtaXNzaWxlIHJvdXRlc1xuICBjb25zdCBuZXdSb3V0ZXM6IE1pc3NpbGVSb3V0ZVtdID0gbXNnLm1pc3NpbGVSb3V0ZXM7XG4gIGRpZmZSb3V0ZXMocHJldlJvdXRlcywgbmV3Um91dGVzLCBidXMpO1xuICBzdGF0ZS5taXNzaWxlUm91dGVzID0gbmV3Um91dGVzO1xuXG4gIC8vIFVwZGF0ZSBhY3RpdmUgcm91dGVcbiAgY29uc3QgbmV4dEFjdGl2ZSA9IG1zZy5hY3RpdmVNaXNzaWxlUm91dGUgfHwgKG5ld1JvdXRlcy5sZW5ndGggPiAwID8gbmV3Um91dGVzWzBdLmlkIDogbnVsbCk7XG4gIHN0YXRlLmFjdGl2ZU1pc3NpbGVSb3V0ZUlkID0gbmV4dEFjdGl2ZTtcbiAgaWYgKG5leHRBY3RpdmUgIT09IHByZXZBY3RpdmVSb3V0ZSkge1xuICAgIGJ1cy5lbWl0KFwibWlzc2lsZTphY3RpdmVSb3V0ZUNoYW5nZWRcIiwgeyByb3V0ZUlkOiBuZXh0QWN0aXZlIH0pO1xuICB9XG5cbiAgLy8gVXBkYXRlIG1pc3NpbGUgY29uZmlnXG4gIGlmIChtc2cubWlzc2lsZUNvbmZpZykge1xuICAgIHVwZGF0ZU1pc3NpbGVMaW1pdHMoc3RhdGUsIHtcbiAgICAgIHNwZWVkTWluOiBtc2cubWlzc2lsZUNvbmZpZy5zcGVlZE1pbixcbiAgICAgIHNwZWVkTWF4OiBtc2cubWlzc2lsZUNvbmZpZy5zcGVlZE1heCxcbiAgICAgIGFncm9NaW46IG1zZy5taXNzaWxlQ29uZmlnLmFncm9NaW4sXG4gICAgfSk7XG5cbiAgICBjb25zdCBwcmV2SGVhdCA9IHN0YXRlLm1pc3NpbGVDb25maWcuaGVhdFBhcmFtcztcbiAgICBsZXQgaGVhdFBhcmFtczogeyBtYXg6IG51bWJlcjsgd2FybkF0OiBudW1iZXI7IG92ZXJoZWF0QXQ6IG51bWJlcjsgbWFya2VyU3BlZWQ6IG51bWJlcjsga1VwOiBudW1iZXI7IGtEb3duOiBudW1iZXI7IGV4cDogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG4gICAgaWYgKG1zZy5taXNzaWxlQ29uZmlnLmhlYXRDb25maWcpIHtcbiAgICAgIGNvbnN0IGhlYXRDb25maWcgPSBtc2cubWlzc2lsZUNvbmZpZy5oZWF0Q29uZmlnO1xuICAgICAgaGVhdFBhcmFtcyA9IHtcbiAgICAgICAgbWF4OiBoZWF0Q29uZmlnLm1heCA/PyBwcmV2SGVhdD8ubWF4ID8/IDAsXG4gICAgICAgIHdhcm5BdDogaGVhdENvbmZpZy53YXJuQXQgPz8gcHJldkhlYXQ/Lndhcm5BdCA/PyAwLFxuICAgICAgICBvdmVyaGVhdEF0OiBoZWF0Q29uZmlnLm92ZXJoZWF0QXQgPz8gcHJldkhlYXQ/Lm92ZXJoZWF0QXQgPz8gMCxcbiAgICAgICAgbWFya2VyU3BlZWQ6IGhlYXRDb25maWcubWFya2VyU3BlZWQgPz8gcHJldkhlYXQ/Lm1hcmtlclNwZWVkID8/IDAsXG4gICAgICAgIGtVcDogaGVhdENvbmZpZy5rVXAgPz8gcHJldkhlYXQ/LmtVcCA/PyAwLFxuICAgICAgICBrRG93bjogaGVhdENvbmZpZy5rRG93biA/PyBwcmV2SGVhdD8ua0Rvd24gPz8gMCxcbiAgICAgICAgZXhwOiBoZWF0Q29uZmlnLmV4cCA/PyBwcmV2SGVhdD8uZXhwID8/IDEsXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IHNhbml0aXplZCA9IHNhbml0aXplTWlzc2lsZUNvbmZpZyh7XG4gICAgICBzcGVlZDogbXNnLm1pc3NpbGVDb25maWcuc3BlZWQsXG4gICAgICBhZ3JvUmFkaXVzOiBtc2cubWlzc2lsZUNvbmZpZy5hZ3JvUmFkaXVzLFxuICAgICAgaGVhdFBhcmFtcyxcbiAgICB9LCBzdGF0ZS5taXNzaWxlQ29uZmlnLCBzdGF0ZS5taXNzaWxlTGltaXRzKTtcbiAgICBzYW5pdGl6ZWQubGlmZXRpbWUgPSBtc2cubWlzc2lsZUNvbmZpZy5saWZldGltZTtcbiAgICBzdGF0ZS5taXNzaWxlQ29uZmlnID0gc2FuaXRpemVkO1xuICB9XG5cbiAgLy8gVXBkYXRlIHdvcmxkIG1ldGFcbiAgc3RhdGUud29ybGRNZXRhID0ge1xuICAgIGM6IG1zZy5tZXRhLmMsXG4gICAgdzogbXNnLm1ldGEudyxcbiAgICBoOiBtc2cubWV0YS5oLFxuICB9O1xuXG4gIC8vIFBoYXNlIDI6IFVwZGF0ZSBpbnZlbnRvcnlcbiAgaWYgKG1zZy5pbnZlbnRvcnkpIHtcbiAgICBzdGF0ZS5pbnZlbnRvcnkgPSB7XG4gICAgICBpdGVtczogbXNnLmludmVudG9yeS5pdGVtcy5tYXAoKGl0ZW0pID0+ICh7XG4gICAgICAgIHR5cGU6IGl0ZW0udHlwZSxcbiAgICAgICAgdmFyaWFudF9pZDogaXRlbS52YXJpYW50SWQsXG4gICAgICAgIGhlYXRfY2FwYWNpdHk6IGl0ZW0uaGVhdENhcGFjaXR5LFxuICAgICAgICBxdWFudGl0eTogaXRlbS5xdWFudGl0eSxcbiAgICAgIH0pKSxcbiAgICB9O1xuICB9XG5cbiAgLy8gUGhhc2UgMjogVXBkYXRlIERBRyAocHJvdG9Ub1N0YXRlIGFscmVhZHkgbm9ybWFsaXplZCB2aWEgcHJvdG9faGVscGVycylcbiAgaWYgKG1zZy5kYWcpIHtcbiAgICBzdGF0ZS5kYWcgPSB7XG4gICAgICBub2RlczogbXNnLmRhZy5ub2Rlcy5tYXAoKG4pID0+ICh7XG4gICAgICAgIGlkOiBuLmlkLFxuICAgICAgICBraW5kOiBuLmtpbmQsXG4gICAgICAgIGxhYmVsOiBuLmxhYmVsLFxuICAgICAgICBzdGF0dXM6IG4uc3RhdHVzLFxuICAgICAgICByZW1haW5pbmdfczogbi5yZW1haW5pbmdTLFxuICAgICAgICBkdXJhdGlvbl9zOiBuLmR1cmF0aW9uUyxcbiAgICAgICAgcmVwZWF0YWJsZTogbi5yZXBlYXRhYmxlLFxuICAgICAgICBlZmZlY3RzOiBuLmVmZmVjdHMsXG4gICAgICB9KSksXG4gICAgfTtcbiAgfVxuXG4gIC8vIFBoYXNlIDI6IFVwZGF0ZSBjYXBhYmlsaXRpZXNcbiAgaWYgKG1zZy5jYXBhYmlsaXRpZXMpIHtcbiAgICBzdGF0ZS5jYXBhYmlsaXRpZXMgPSB7XG4gICAgICBzcGVlZE11bHRpcGxpZXI6IG1zZy5jYXBhYmlsaXRpZXMuc3BlZWRNdWx0aXBsaWVyLFxuICAgICAgdW5sb2NrZWRNaXNzaWxlczogbXNnLmNhcGFiaWxpdGllcy51bmxvY2tlZE1pc3NpbGVzLFxuICAgICAgaGVhdENhcGFjaXR5OiBtc2cuY2FwYWJpbGl0aWVzLmhlYXRDYXBhY2l0eSxcbiAgICAgIGhlYXRFZmZpY2llbmN5OiBtc2cuY2FwYWJpbGl0aWVzLmhlYXRFZmZpY2llbmN5LFxuICAgIH07XG4gIH1cblxuICAvLyBQaGFzZSAyOiBVcGRhdGUgc3RvcnlcbiAgaWYgKG1zZy5zdG9yeSkge1xuICAgIGNvbnN0IHByZXZBY3RpdmVOb2RlID0gc3RhdGUuc3Rvcnk/LmFjdGl2ZU5vZGUgPz8gbnVsbDtcblxuICAgIC8vIENvbnZlcnQgc3RvcnkgZGlhbG9ndWUgdG8gRGlhbG9ndWVDb250ZW50IGZvcm1hdFxuICAgIGxldCBkaWFsb2d1ZTogRGlhbG9ndWVDb250ZW50IHwgbnVsbCA9IG51bGw7XG4gICAgaWYgKG1zZy5zdG9yeS5kaWFsb2d1ZSkge1xuICAgICAgY29uc3QgZCA9IG1zZy5zdG9yeS5kaWFsb2d1ZTtcbiAgICAgIGRpYWxvZ3VlID0ge1xuICAgICAgICBzcGVha2VyOiBkLnNwZWFrZXIsXG4gICAgICAgIHRleHQ6IGQudGV4dCxcbiAgICAgICAgaW50ZW50OiBkLmludGVudCBhcyBcImZhY3RvcnlcIiB8IFwidW5pdFwiLFxuICAgICAgICB0eXBpbmdTcGVlZE1zOiAxOCxcbiAgICAgICAgY29udGludWVMYWJlbDogZC5jb250aW51ZUxhYmVsLFxuICAgICAgICBjaG9pY2VzOiBkLmNob2ljZXM/Lm1hcChjID0+ICh7IGlkOiBjLmlkLCB0ZXh0OiBjLnRleHQgfSkpLFxuICAgICAgICB0dXRvcmlhbFRpcDogZC50dXRvcmlhbFRpcCA/IHtcbiAgICAgICAgICB0aXRsZTogZC50dXRvcmlhbFRpcC50aXRsZSxcbiAgICAgICAgICB0ZXh0OiBkLnR1dG9yaWFsVGlwLnRleHQsXG4gICAgICAgIH0gOiB1bmRlZmluZWQsXG4gICAgICB9O1xuICAgIH1cblxuICAgIHN0YXRlLnN0b3J5ID0ge1xuICAgICAgYWN0aXZlTm9kZTogbXNnLnN0b3J5LmFjdGl2ZU5vZGUgfHwgbnVsbCxcbiAgICAgIGRpYWxvZ3VlLFxuICAgICAgYXZhaWxhYmxlOiBtc2cuc3RvcnkuYXZhaWxhYmxlLFxuICAgICAgZmxhZ3M6IG1zZy5zdG9yeS5mbGFncyxcbiAgICAgIHJlY2VudEV2ZW50czogbXNnLnN0b3J5LnJlY2VudEV2ZW50cy5tYXAoKGV2dCkgPT4gKHtcbiAgICAgICAgY2hhcHRlcjogZXZ0LmNoYXB0ZXJJZCxcbiAgICAgICAgbm9kZTogZXZ0Lm5vZGVJZCxcbiAgICAgICAgdGltZXN0YW1wOiBldnQudGltZXN0YW1wLFxuICAgICAgfSkpLFxuICAgIH07XG5cbiAgICAvLyBFbWl0IGV2ZW50IHdoZW4gYWN0aXZlIHN0b3J5IG5vZGUgY2hhbmdlc1xuICAgIGlmIChzdGF0ZS5zdG9yeS5hY3RpdmVOb2RlICE9PSBwcmV2QWN0aXZlTm9kZSAmJiBzdGF0ZS5zdG9yeS5hY3RpdmVOb2RlKSB7XG4gICAgICBidXMuZW1pdChcInN0b3J5Om5vZGVBY3RpdmF0ZWRcIiwge1xuICAgICAgICBub2RlSWQ6IHN0YXRlLnN0b3J5LmFjdGl2ZU5vZGUsXG4gICAgICAgIGRpYWxvZ3VlOiBzdGF0ZS5zdG9yeS5kaWFsb2d1ZSA/PyB1bmRlZmluZWQsXG4gICAgICB9KTtcbiAgICB9XG4gIH1cblxuICAvLyBFbWl0IG1pc3NpbGUgY291bnQgY2hhbmdlIGlmIG5lZWRlZFxuICBjb25zdCBuZXdNaXNzaWxlQ291bnQgPSBzdGF0ZS5taXNzaWxlcy5sZW5ndGg7XG4gIGlmIChuZXdNaXNzaWxlQ291bnQgPiBwcmV2TWlzc2lsZUNvdW50KSB7XG4gICAgZm9yIChsZXQgaSA9IHByZXZNaXNzaWxlQ291bnQ7IGkgPCBuZXdNaXNzaWxlQ291bnQ7IGkrKykge1xuICAgICAgY29uc3QgbSA9IHN0YXRlLm1pc3NpbGVzW2ldO1xuICAgICAgaWYgKG0gJiYgbS5zZWxmKSB7XG4gICAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpsYXVuY2hlZFwiLCB7IHJvdXRlSWQ6IG1zZy5hY3RpdmVNaXNzaWxlUm91dGUgfHwgXCJcIiB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBFbWl0IGNvb2xkb3duIHVwZGF0ZVxuICBjb25zdCBjb29sZG93blJlbWFpbmluZyA9IE1hdGgubWF4KDAsIHN0YXRlLm5leHRNaXNzaWxlUmVhZHlBdCAtIGdldEFwcHJveFNlcnZlck5vdyhzdGF0ZSkpO1xuICBidXMuZW1pdChcIm1pc3NpbGU6Y29vbGRvd25VcGRhdGVkXCIsIHsgc2Vjb25kc1JlbWFpbmluZzogY29vbGRvd25SZW1haW5pbmcgfSk7XG59XG5cbmZ1bmN0aW9uIGRpZmZSb3V0ZXMocHJldlJvdXRlczogTWFwPHN0cmluZywgTWlzc2lsZVJvdXRlPiwgbmV4dFJvdXRlczogTWlzc2lsZVJvdXRlW10sIGJ1czogRXZlbnRCdXMpOiB2b2lkIHtcbiAgY29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICBmb3IgKGNvbnN0IHJvdXRlIG9mIG5leHRSb3V0ZXMpIHtcbiAgICBzZWVuLmFkZChyb3V0ZS5pZCk7XG4gICAgY29uc3QgcHJldiA9IHByZXZSb3V0ZXMuZ2V0KHJvdXRlLmlkKTtcbiAgICBpZiAoIXByZXYpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpyb3V0ZUFkZGVkXCIsIHsgcm91dGVJZDogcm91dGUuaWQgfSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgaWYgKHJvdXRlLm5hbWUgIT09IHByZXYubmFtZSkge1xuICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOnJvdXRlUmVuYW1lZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkLCBuYW1lOiByb3V0ZS5uYW1lIH0pO1xuICAgIH1cbiAgICBpZiAocm91dGUud2F5cG9pbnRzLmxlbmd0aCA+IHByZXYud2F5cG9pbnRzLmxlbmd0aCkge1xuICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOndheXBvaW50QWRkZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCwgaW5kZXg6IHJvdXRlLndheXBvaW50cy5sZW5ndGggLSAxIH0pO1xuICAgIH0gZWxzZSBpZiAocm91dGUud2F5cG9pbnRzLmxlbmd0aCA8IHByZXYud2F5cG9pbnRzLmxlbmd0aCkge1xuICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOndheXBvaW50RGVsZXRlZFwiLCB7IHJvdXRlSWQ6IHJvdXRlLmlkLCBpbmRleDogcHJldi53YXlwb2ludHMubGVuZ3RoIC0gMSB9KTtcbiAgICB9XG4gICAgaWYgKHByZXYud2F5cG9pbnRzLmxlbmd0aCA+IDAgJiYgcm91dGUud2F5cG9pbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgYnVzLmVtaXQoXCJtaXNzaWxlOndheXBvaW50c0NsZWFyZWRcIiwgeyByb3V0ZUlkOiByb3V0ZS5pZCB9KTtcbiAgICB9XG4gIH1cbiAgZm9yIChjb25zdCBbcm91dGVJZF0gb2YgcHJldlJvdXRlcykge1xuICAgIGlmICghc2Vlbi5oYXMocm91dGVJZCkpIHtcbiAgICAgIGJ1cy5lbWl0KFwibWlzc2lsZTpyb3V0ZURlbGV0ZWRcIiwgeyByb3V0ZUlkIH0pO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBjbG9uZVJvdXRlKHJvdXRlOiBNaXNzaWxlUm91dGUpOiBNaXNzaWxlUm91dGUge1xuICByZXR1cm4ge1xuICAgIGlkOiByb3V0ZS5pZCxcbiAgICBuYW1lOiByb3V0ZS5uYW1lLFxuICAgIHdheXBvaW50czogcm91dGUud2F5cG9pbnRzLm1hcCgod3ApID0+ICh7IC4uLndwIH0pKSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEFwcHJveFNlcnZlck5vdyhzdGF0ZTogQXBwU3RhdGUpOiBudW1iZXIge1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZShzdGF0ZS5ub3cpKSB7XG4gICAgcmV0dXJuIDA7XG4gIH1cbiAgY29uc3Qgc3luY2VkQXQgPSBOdW1iZXIuaXNGaW5pdGUoc3RhdGUubm93U3luY2VkQXQpID8gc3RhdGUubm93U3luY2VkQXQgOiBudWxsO1xuICBpZiAoIXN5bmNlZEF0KSB7XG4gICAgcmV0dXJuIHN0YXRlLm5vdztcbiAgfVxuICBjb25zdCBlbGFwc2VkTXMgPSBtb25vdG9uaWNOb3coKSAtIHN5bmNlZEF0O1xuICBpZiAoIU51bWJlci5pc0Zpbml0ZShlbGFwc2VkTXMpIHx8IGVsYXBzZWRNcyA8IDApIHtcbiAgICByZXR1cm4gc3RhdGUubm93O1xuICB9XG4gIHJldHVybiBzdGF0ZS5ub3cgKyBlbGFwc2VkTXMgLyAxMDAwO1xufVxuXG5mdW5jdGlvbiBjb252ZXJ0SGVhdFZpZXcoc2VydmVySGVhdDogeyB2OiBudW1iZXI7IG06IG51bWJlcjsgdzogbnVtYmVyOyBvOiBudW1iZXI7IG1zOiBudW1iZXI7IHN1OiBudW1iZXI7IGt1OiBudW1iZXI7IGtkOiBudW1iZXI7IGV4OiBudW1iZXIgfSwgbm93U3luY2VkQXRNczogbnVtYmVyLCBzZXJ2ZXJOb3dTZWM6IG51bWJlcik6IGltcG9ydChcIi4vc3RhdGVcIikuSGVhdFZpZXcge1xuICAvLyBDb252ZXJ0IHNlcnZlciB0aW1lIChzdGFsbFVudGlsIGluIHNlY29uZHMpIHRvIGNsaWVudCB0aW1lIChtaWxsaXNlY29uZHMpXG4gIC8vIHN0YWxsVW50aWwgaXMgYWJzb2x1dGUgc2VydmVyIHRpbWUsIHNvIHdlIG5lZWQgdG8gY29udmVydCBpdCB0byBjbGllbnQgdGltZVxuICBjb25zdCBzZXJ2ZXJTdGFsbFVudGlsU2VjID0gc2VydmVySGVhdC5zdTtcbiAgY29uc3Qgb2Zmc2V0RnJvbU5vd1NlYyA9IHNlcnZlclN0YWxsVW50aWxTZWMgLSBzZXJ2ZXJOb3dTZWM7XG4gIGNvbnN0IHN0YWxsVW50aWxNcyA9IG5vd1N5bmNlZEF0TXMgKyAob2Zmc2V0RnJvbU5vd1NlYyAqIDEwMDApO1xuXG4gIGNvbnN0IGhlYXRWaWV3ID0ge1xuICAgIHZhbHVlOiBzZXJ2ZXJIZWF0LnYsXG4gICAgbWF4OiBzZXJ2ZXJIZWF0Lm0sXG4gICAgd2FybkF0OiBzZXJ2ZXJIZWF0LncsXG4gICAgb3ZlcmhlYXRBdDogc2VydmVySGVhdC5vLFxuICAgIG1hcmtlclNwZWVkOiBzZXJ2ZXJIZWF0Lm1zLFxuICAgIHN0YWxsVW50aWxNczogc3RhbGxVbnRpbE1zLFxuICAgIGtVcDogc2VydmVySGVhdC5rdSxcbiAgICBrRG93bjogc2VydmVySGVhdC5rZCxcbiAgICBleHA6IHNlcnZlckhlYXQuZXgsXG4gIH07XG4gIHJldHVybiBoZWF0Vmlldztcbn1cbiIsICJpbXBvcnQgdHlwZSB7IEV2ZW50QnVzIH0gZnJvbSBcIi4vYnVzXCI7XG5pbXBvcnQgdHlwZSB7IEFwcFN0YXRlLCBEYWdOb2RlIH0gZnJvbSBcIi4vc3RhdGVcIjtcbmltcG9ydCB7IFVwZ3JhZGVFZmZlY3RUeXBlIH0gZnJvbSBcIi4vcHJvdG8vcHJvdG8vd3NfbWVzc2FnZXNfcGJcIjtcbmltcG9ydCB7IHNlbmREYWdTdGFydCB9IGZyb20gXCIuL25ldFwiO1xuXG5sZXQgY291bnRkb3duSW50ZXJ2YWw6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXG5leHBvcnQgZnVuY3Rpb24gaW5pdFVwZ3JhZGVzUGFuZWwoXG4gIHN0YXRlOiBBcHBTdGF0ZSxcbiAgYnVzOiBFdmVudEJ1c1xuKTogdm9pZCB7XG4gIC8vIENyZWF0ZSBwYW5lbCBET00gc3RydWN0dXJlXG4gIGNvbnN0IHBhbmVsID0gY3JlYXRlUGFuZWxFbGVtZW50KCk7XG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFuZWwpO1xuXG4gIGNvbnN0IGNvbnRhaW5lciA9IHBhbmVsLnF1ZXJ5U2VsZWN0b3IoJy50ZWNoLXRyZWUtY29udGFpbmVyJykgYXMgSFRNTEVsZW1lbnQ7XG4gIGNvbnN0IGNsb3NlQnRuID0gcGFuZWwucXVlcnlTZWxlY3RvcignLmNsb3NlLWJ0bicpIGFzIEhUTUxFbGVtZW50O1xuICBjb25zdCBvdmVybGF5ID0gcGFuZWwucXVlcnlTZWxlY3RvcignLnBhbmVsLW92ZXJsYXknKSBhcyBIVE1MRWxlbWVudDtcblxuICAvLyBSZW5kZXIgZnVuY3Rpb24gKHRocm90dGxlZCBieSBzaWduYXR1cmUgb2YgaWQ6c3RhdHVzKVxuICBsZXQgbGFzdFNpZyA9IFwiXCI7XG4gIGZ1bmN0aW9uIGNvbXB1dGVTaWcobm9kZXM6IERhZ05vZGVbXSk6IHN0cmluZyB7XG4gICAgcmV0dXJuIG5vZGVzXG4gICAgICAuc2xpY2UoKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSlcbiAgICAgIC5tYXAobiA9PiBgJHtuLmlkfToke24uc3RhdHVzfWApXG4gICAgICAuam9pbihcInxcIik7XG4gIH1cbiAgZnVuY3Rpb24gcmVuZGVyVXBncmFkZXMoZm9yY2UgPSBmYWxzZSkge1xuICAgIGNvbnN0IGFsbCA9IHN0YXRlLmRhZz8ubm9kZXMgfHwgW107XG4gICAgLy8gQmUgcGVybWlzc2l2ZTogdHJlYXQgcHJvdG8tbWFwcGVkICd1bml0JyBhcyB1cGdyYWRlcywgYnV0IGFsc28gYWxsb3cgaWQgcHJlZml4XG4gICAgY29uc3QgdXBncmFkZU5vZGVzID0gYWxsLmZpbHRlcihuID0+IG4ua2luZCA9PT0gJ3VuaXQnIHx8IG4uaWQuc3RhcnRzV2l0aCgndXBncmFkZS4nKSk7XG4gICAgY29uc3Qgc2lnID0gY29tcHV0ZVNpZyh1cGdyYWRlTm9kZXMpO1xuICAgIGlmICghZm9yY2UgJiYgc2lnID09PSBsYXN0U2lnKSByZXR1cm47XG4gICAgbGFzdFNpZyA9IHNpZztcbiAgICByZW5kZXJUZWNoVHJlZSh1cGdyYWRlTm9kZXMsIGNvbnRhaW5lcik7XG4gIH1cblxuICAvLyBUb2dnbGUgcGFuZWwgdmlzaWJpbGl0eVxuICBmdW5jdGlvbiB0b2dnbGVQYW5lbCh2aXNpYmxlOiBib29sZWFuKSB7XG4gICAgcGFuZWwuY2xhc3NMaXN0LnRvZ2dsZSgndmlzaWJsZScsIHZpc2libGUpO1xuICAgIGlmICh2aXNpYmxlKSB7XG4gICAgICByZW5kZXJVcGdyYWRlcygpO1xuICAgIH1cbiAgfVxuXG4gIC8vIEV2ZW50IGxpc3RlbmVyc1xuICBidXMub24oXCJ1cGdyYWRlczp0b2dnbGVcIiwgKCkgPT4ge1xuICAgIGNvbnN0IG5leHQgPSAhcGFuZWwuY2xhc3NMaXN0LmNvbnRhaW5zKCd2aXNpYmxlJyk7XG4gICAgdG9nZ2xlUGFuZWwobmV4dCk7XG4gICAgaWYgKG5leHQpIHJlbmRlclVwZ3JhZGVzKHRydWUpO1xuICB9KTtcblxuICBidXMub24oXCJ1cGdyYWRlczpzaG93XCIsICgpID0+IHsgdG9nZ2xlUGFuZWwodHJ1ZSk7IHJlbmRlclVwZ3JhZGVzKHRydWUpOyB9KTtcbiAgYnVzLm9uKFwidXBncmFkZXM6aGlkZVwiLCAoKSA9PiB0b2dnbGVQYW5lbChmYWxzZSkpO1xuXG4gIGNsb3NlQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB0b2dnbGVQYW5lbChmYWxzZSkpO1xuICBvdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB0b2dnbGVQYW5lbChmYWxzZSkpO1xuXG4gIC8vIFN1YnNjcmliZSB0byBEQUcgdXBkYXRlcyAoZXZlbnQtZHJpdmVuIHBhdHRlcm4pXG4gIGJ1cy5vbihcInN0YXRlOnVwZGF0ZWRcIiwgKCkgPT4ge1xuICAgIGlmIChwYW5lbC5jbGFzc0xpc3QuY29udGFpbnMoJ3Zpc2libGUnKSkge1xuICAgICAgcmVuZGVyVXBncmFkZXMoZmFsc2UpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gSGFuZGxlIG5vZGUgY2xpY2tcbiAgY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xuICAgIGNvbnN0IG5vZGVFbCA9IChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkuY2xvc2VzdChcIltkYXRhLW5vZGUtaWRdXCIpO1xuICAgIGlmICghbm9kZUVsKSByZXR1cm47XG5cbiAgICBjb25zdCBub2RlSWQgPSBub2RlRWwuZ2V0QXR0cmlidXRlKFwiZGF0YS1ub2RlLWlkXCIpO1xuICAgIGNvbnN0IG5vZGUgPSBzdGF0ZS5kYWc/Lm5vZGVzLmZpbmQobiA9PiBuLmlkID09PSBub2RlSWQpO1xuXG4gICAgaWYgKG5vZGU/LnN0YXR1cyA9PT0gXCJhdmFpbGFibGVcIikge1xuICAgICAgc2VuZERhZ1N0YXJ0KG5vZGVJZCEpO1xuICAgIH1cbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVBhbmVsRWxlbWVudCgpOiBIVE1MRWxlbWVudCB7XG4gIGNvbnN0IHBhbmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gIHBhbmVsLmNsYXNzTmFtZSA9ICd1cGdyYWRlcy1wYW5lbCc7XG4gIHBhbmVsLmlubmVySFRNTCA9IGBcbiAgICA8ZGl2IGNsYXNzPVwicGFuZWwtb3ZlcmxheVwiPjwvZGl2PlxuICAgIDxkaXYgY2xhc3M9XCJwYW5lbC1jb250ZW50XCI+XG4gICAgICA8ZGl2IGNsYXNzPVwicGFuZWwtaGVhZGVyXCI+XG4gICAgICAgIDxoMj5TaGlwIFVwZ3JhZGVzPC9oMj5cbiAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImNsb3NlLWJ0blwiPlx1MDBENzwvYnV0dG9uPlxuICAgICAgPC9kaXY+XG4gICAgICA8ZGl2IGNsYXNzPVwidGVjaC10cmVlLWNvbnRhaW5lclwiPjwvZGl2PlxuICAgIDwvZGl2PlxuICBgO1xuICByZXR1cm4gcGFuZWw7XG59XG5cbmZ1bmN0aW9uIHJlbmRlclRlY2hUcmVlKG5vZGVzOiBEYWdOb2RlW10sIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgY29uc3Qgc29ydGVkID0gbm9kZXMuc2xpY2UoKS5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpO1xuICBjb250YWluZXIuaW5uZXJIVE1MID0gYFxuICAgIDxkaXYgY2xhc3M9XCJ0ZWNoLXRyZWVcIj5cbiAgICAgICR7c29ydGVkLmxlbmd0aCA+IDAgPyBzb3J0ZWQubWFwKHJlbmRlck5vZGUpLmpvaW4oJycpIDogJzxkaXYgY2xhc3M9XFxcIm11dGVkXFxcIj5ObyB1cGdyYWRlcyBhdmFpbGFibGU8L2Rpdj4nfVxuICAgIDwvZGl2PlxuICBgO1xufVxuXG5mdW5jdGlvbiBlZmZlY3RUeXBlVG9TdHJpbmcodDogdW5rbm93bik6IHN0cmluZyB7XG4gIGlmICh0eXBlb2YgdCA9PT0gXCJzdHJpbmdcIikgcmV0dXJuIHQ7XG4gIGlmICh0eXBlb2YgdCA9PT0gXCJudW1iZXJcIikge1xuICAgIHN3aXRjaCAodCkge1xuICAgICAgY2FzZSBVcGdyYWRlRWZmZWN0VHlwZS5TUEVFRF9NVUxUSVBMSUVSOlxuICAgICAgICByZXR1cm4gXCJzcGVlZF9tdWx0aXBsaWVyXCI7XG4gICAgICBjYXNlIFVwZ3JhZGVFZmZlY3RUeXBlLk1JU1NJTEVfVU5MT0NLOlxuICAgICAgICByZXR1cm4gXCJtaXNzaWxlX3VubG9ja1wiO1xuICAgICAgY2FzZSBVcGdyYWRlRWZmZWN0VHlwZS5IRUFUX0NBUEFDSVRZOlxuICAgICAgICByZXR1cm4gXCJoZWF0X2NhcGFjaXR5XCI7XG4gICAgICBjYXNlIFVwZ3JhZGVFZmZlY3RUeXBlLkhFQVRfRUZGSUNJRU5DWTpcbiAgICAgICAgcmV0dXJuIFwiaGVhdF9lZmZpY2llbmN5XCI7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4gXCJ1bmtub3duXCI7XG4gICAgfVxuICB9XG4gIHJldHVybiBcInVua25vd25cIjtcbn1cblxuZnVuY3Rpb24gcmVuZGVyTm9kZShub2RlOiBEYWdOb2RlKTogc3RyaW5nIHtcbiAgY29uc3Qgc3RhdHVzQ2xhc3MgPSBgbm9kZS0ke25vZGUuc3RhdHVzfWA7XG4gIGNvbnN0IGVmZmVjdHNIdG1sID0gbm9kZS5lZmZlY3RzPy5tYXAoZSA9PiB7XG4gICAgY29uc3QgdHlwZSA9IGVmZmVjdFR5cGVUb1N0cmluZygoZSBhcyBhbnkpLnR5cGUpO1xuICAgIGNvbnN0IHZhbHVlID0gKGUgYXMgYW55KS52YWx1ZSBhcyBudW1iZXIgfCBzdHJpbmc7XG4gICAgY29uc3QgaXNTaGlwID0gbm9kZS5pZC5zdGFydHNXaXRoKFwidXBncmFkZS5zaGlwLlwiKTtcbiAgICBjb25zdCBpc01pc3NpbGUgPSBub2RlLmlkLnN0YXJ0c1dpdGgoXCJ1cGdyYWRlLm1pc3NpbGUuXCIpO1xuICAgIGlmICh0eXBlID09PSBcIm1pc3NpbGVfdW5sb2NrXCIpIHtcbiAgICAgIHJldHVybiBgVW5sb2NrICR7dmFsdWV9YDtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJudW1iZXJcIikge1xuICAgICAgY29uc3QgcGN0ID0gKCh2YWx1ZSAtIDEpICogMTAwKTtcbiAgICAgIGNvbnN0IHBjdFN0ciA9IE51bWJlci5pc0Zpbml0ZShwY3QpID8gcGN0LnRvRml4ZWQoMCkgOiBcIjBcIjtcbiAgICAgIGlmICh0eXBlID09PSBcInNwZWVkX211bHRpcGxpZXJcIikge1xuICAgICAgICByZXR1cm4gaXNTaGlwID8gYCske3BjdFN0cn0lIFNoaXAgU3BlZWRgIDogaXNNaXNzaWxlID8gYCske3BjdFN0cn0lIE1pc3NpbGUgU3BlZWRgIDogYCske3BjdFN0cn0lIFNwZWVkYDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlID09PSBcImhlYXRfY2FwYWNpdHlcIikge1xuICAgICAgICByZXR1cm4gaXNTaGlwID8gYCske3BjdFN0cn0lIFNoaXAgSGVhdGAgOiBpc01pc3NpbGUgPyBgKyR7cGN0U3RyfSUgTWlzc2lsZSBIZWF0YCA6IGArJHtwY3RTdHJ9JSBIZWF0IENhcGFjaXR5YDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlID09PSBcImhlYXRfZWZmaWNpZW5jeVwiKSB7XG4gICAgICAgIHJldHVybiBgKyR7cGN0U3RyfSUgQ29vbGluZ2A7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBcIlwiO1xuICB9KS5qb2luKCcsICcpIHx8ICcnO1xuXG4gIGNvbnN0IGNvdW50ZG93bkh0bWwgPSBub2RlLnN0YXR1cyA9PT0gJ2luX3Byb2dyZXNzJ1xuICAgID8gYDxkaXYgY2xhc3M9XCJjb3VudGRvd25cIj4ke2Zvcm1hdFRpbWUobm9kZS5yZW1haW5pbmdfcyl9PC9kaXY+YFxuICAgIDogJyc7XG5cbiAgcmV0dXJuIGBcbiAgICA8ZGl2IGNsYXNzPVwibm9kZSAke3N0YXR1c0NsYXNzfVwiIGRhdGEtbm9kZS1pZD1cIiR7bm9kZS5pZH1cIj5cbiAgICAgIDxoMz4ke25vZGUubGFiZWx9PC9oMz5cbiAgICAgICR7ZWZmZWN0c0h0bWwgPyBgPHAgY2xhc3M9XCJlZmZlY3RzXCI+JHtlZmZlY3RzSHRtbH08L3A+YCA6ICcnfVxuICAgICAgPHAgY2xhc3M9XCJkdXJhdGlvblwiPkR1cmF0aW9uOiAke2Zvcm1hdFRpbWUobm9kZS5kdXJhdGlvbl9zKX08L3A+XG4gICAgICAke2NvdW50ZG93bkh0bWx9XG4gICAgICAke25vZGUuc3RhdHVzID09PSAnYXZhaWxhYmxlJyA/ICc8YnV0dG9uPlN0YXJ0PC9idXR0b24+JyA6ICcnfVxuICAgICAgJHtub2RlLnN0YXR1cyA9PT0gJ2NvbXBsZXRlZCcgPyAnPGRpdiBjbGFzcz1cImNoZWNrbWFya1wiPlx1MjcxMzwvZGl2PicgOiAnJ31cbiAgICA8L2Rpdj5cbiAgYDtcbn1cblxuZnVuY3Rpb24gZm9ybWF0VGltZShzZWNvbmRzOiBudW1iZXIpOiBzdHJpbmcge1xuICBpZiAoc2Vjb25kcyA8IDYwKSByZXR1cm4gYCR7TWF0aC5mbG9vcihzZWNvbmRzKX1zYDtcbiAgaWYgKHNlY29uZHMgPCAzNjAwKSByZXR1cm4gYCR7TWF0aC5mbG9vcihzZWNvbmRzIC8gNjApfW1gO1xuICByZXR1cm4gYCR7TWF0aC5mbG9vcihzZWNvbmRzIC8gMzYwMCl9aCAke01hdGguZmxvb3IoKHNlY29uZHMgJSAzNjAwKSAvIDYwKX1tYDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0YXJ0Q291bnRkb3duVGltZXIoc3RhdGU6IEFwcFN0YXRlLCBidXM6IEV2ZW50QnVzKTogdm9pZCB7XG4gIGlmIChjb3VudGRvd25JbnRlcnZhbCkge1xuICAgIGNsZWFySW50ZXJ2YWwoY291bnRkb3duSW50ZXJ2YWwpO1xuICB9XG5cbiAgY291bnRkb3duSW50ZXJ2YWwgPSB3aW5kb3cuc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgIGNvbnN0IHVwZ3JhZGVOb2RlcyA9IHN0YXRlLmRhZz8ubm9kZXMuZmlsdGVyKG4gPT5cbiAgICAgIG4ua2luZCA9PT0gJ3VuaXQnICYmIG4uc3RhdHVzID09PSAnaW5fcHJvZ3Jlc3MnXG4gICAgKSB8fCBbXTtcblxuICAgIHVwZ3JhZGVOb2Rlcy5mb3JFYWNoKG5vZGUgPT4ge1xuICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGBbZGF0YS1ub2RlLWlkPVwiJHtub2RlLmlkfVwiXSAuY291bnRkb3duYCk7XG4gICAgICBpZiAoZWwgJiYgbm9kZS5yZW1haW5pbmdfcyA+IDApIHtcbiAgICAgICAgZWwudGV4dENvbnRlbnQgPSBmb3JtYXRUaW1lKG5vZGUucmVtYWluaW5nX3MpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gVXBkYXRlIGJhZGdlIGNvdW50XG4gICAgY29uc3QgaW5Qcm9ncmVzc0NvdW50ID0gdXBncmFkZU5vZGVzLmxlbmd0aDtcbiAgICBidXMuZW1pdChcInVwZ3JhZGVzOmNvdW50VXBkYXRlZFwiLCB7IGNvdW50OiBpblByb2dyZXNzQ291bnQgfSk7XG4gIH0sIDEwMDApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3RvcENvdW50ZG93blRpbWVyKCk6IHZvaWQge1xuICBpZiAoY291bnRkb3duSW50ZXJ2YWwpIHtcbiAgICBjbGVhckludGVydmFsKGNvdW50ZG93bkludGVydmFsKTtcbiAgICBjb3VudGRvd25JbnRlcnZhbCA9IG51bGw7XG4gIH1cbn1cbiIsICJpbXBvcnQgeyBjcmVhdGVFdmVudEJ1cyB9IGZyb20gXCIuL2J1c1wiO1xuaW1wb3J0IHsgY3JlYXRlSW5pdGlhbFN0YXRlIH0gZnJvbSBcIi4vc3RhdGVcIjtcbmltcG9ydCB7IGluaXRVcGdyYWRlc1BhbmVsLCBzdGFydENvdW50ZG93blRpbWVyIH0gZnJvbSBcIi4vdXBncmFkZXNcIjtcbmltcG9ydCB7IGNvbm5lY3RXZWJTb2NrZXQgfSBmcm9tIFwiLi9uZXRcIjtcblxuY29uc3QgU1RPUkFHRV9LRVkgPSBcImxzZDpjYWxsc2lnblwiO1xuXG50eXBlIE1heWJlPFQ+ID0gVCB8IG51bGwgfCB1bmRlZmluZWQ7XG5cbmxldCBzYXZlU3RhdHVzVGltZXI6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXG5jb25zdCBjYWxsU2lnbklucHV0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MSW5wdXRFbGVtZW50PihcIiNjYWxsLXNpZ24taW5wdXRcIik7XG5jb25zdCBzYXZlU3RhdHVzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzYXZlLXN0YXR1c1wiKTtcbmNvbnN0IGNhbXBhaWduQnV0dG9uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjYW1wYWlnbi1idXR0b25cIik7XG5jb25zdCB0dXRvcmlhbEJ1dHRvbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidHV0b3JpYWwtYnV0dG9uXCIpO1xuY29uc3QgZnJlZXBsYXlCdXR0b24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZyZWVwbGF5LWJ1dHRvblwiKTtcbmNvbnN0IG1hcFNpemVTZWxlY3QgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yPEhUTUxTZWxlY3RFbGVtZW50PihcIiNtYXAtc2l6ZS1zZWxlY3RcIik7XG5jb25zdCB1cGdyYWRlc0J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwidXBncmFkZXMtYnRuXCIpO1xuXG4vLyBJbml0aWFsaXplIHN0YXRlIGFuZCBidXMgZm9yIHVwZ3JhZGVzXG5jb25zdCBidXMgPSBjcmVhdGVFdmVudEJ1cygpO1xuY29uc3Qgc3RhdGUgPSBjcmVhdGVJbml0aWFsU3RhdGUoKTtcblxuLy8gSW5pdGlhbGl6ZSB1cGdyYWRlcyBwYW5lbFxuaW5pdFVwZ3JhZGVzUGFuZWwoc3RhdGUsIGJ1cyk7XG5zdGFydENvdW50ZG93blRpbWVyKHN0YXRlLCBidXMpO1xuXG4vLyBIYW5kbGUgdXBncmFkZXMgYnV0dG9uXG51cGdyYWRlc0J0bj8uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgYnVzLmVtaXQoXCJ1cGdyYWRlczp0b2dnbGVcIik7XG59KTtcblxuLy8gVXBkYXRlIGJhZGdlIHdpdGggaW4tcHJvZ3Jlc3MgY291bnRcbmJ1cy5vbihcInVwZ3JhZGVzOmNvdW50VXBkYXRlZFwiLCAoeyBjb3VudCB9KSA9PiB7XG4gIGNvbnN0IGJhZGdlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ1cGdyYWRlcy1iYWRnZVwiKTtcbiAgaWYgKGJhZGdlKSB7XG4gICAgYmFkZ2UudGV4dENvbnRlbnQgPSBjb3VudCA+IDAgPyBgXHUyNjk5XHVGRTBGICR7Y291bnR9YCA6IFwiXCI7XG4gICAgYmFkZ2Uuc3R5bGUuZGlzcGxheSA9IGNvdW50ID4gMCA/IFwiaW5saW5lXCIgOiBcIm5vbmVcIjtcbiAgfVxufSk7XG5cbi8vIENvbm5lY3QgdG8gc2VydmVyIHRvIGdldCBEQUcgc3RhdGUgKGZvciBsb2JieSByb29tKVxuY29uc3QgdXJsUGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKTtcbmNvbnN0IGxvYmJ5Um9vbSA9IHVybFBhcmFtcy5nZXQoXCJsb2JieVJvb21cIikgfHwgXCJsb2JieS1zaGFyZWRcIjtcbmlmICh0eXBlb2YgV2ViU29ja2V0ICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gIGNvbm5lY3RXZWJTb2NrZXQoe1xuICAgIHJvb206IGxvYmJ5Um9vbSxcbiAgICBzdGF0ZSxcbiAgICBidXMsXG4gICAgb25TdGF0ZVVwZGF0ZWQ6ICgpID0+IHtcbiAgICAgIGJ1cy5lbWl0KFwic3RhdGU6dXBkYXRlZFwiKTtcbiAgICB9LFxuICB9KTtcbn1cblxuYm9vdHN0cmFwKCk7XG5cbmZ1bmN0aW9uIGJvb3RzdHJhcCgpOiB2b2lkIHtcbiAgY29uc3QgaW5pdGlhbE5hbWUgPSByZXNvbHZlSW5pdGlhbENhbGxTaWduKCk7XG4gIGlmIChjYWxsU2lnbklucHV0KSB7XG4gICAgY2FsbFNpZ25JbnB1dC52YWx1ZSA9IGluaXRpYWxOYW1lO1xuICB9XG5cbiAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjYWxsLXNpZ24tZm9ybVwiKT8uYWRkRXZlbnRMaXN0ZW5lcihcInN1Ym1pdFwiLCAoZXZlbnQpID0+IHtcbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IG5hbWUgPSBlbnN1cmVDYWxsU2lnbigpO1xuICAgIGlmIChuYW1lKSB7XG4gICAgICBzaG93U2F2ZVN0YXR1cyhcIlNhdmVkIGNhbGwgc2lnblwiKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2hvd1NhdmVTdGF0dXMoXCJDbGVhcmVkIGNhbGwgc2lnblwiKTtcbiAgICB9XG4gIH0pO1xuXG4gIGNhbXBhaWduQnV0dG9uPy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgIGNvbnN0IG5hbWUgPSBlbnN1cmVDYWxsU2lnbigpO1xuICAgIGNvbnN0IHJvb21JZCA9IGdlbmVyYXRlUm9vbUlkKFwiY2FtcGFpZ25cIik7XG4gICAgY29uc3QgbWlzc2lvbklkID0gXCIxXCI7XG4gICAgY29uc3QgdXJsID0gYnVpbGRSb29tVXJsKFxuICAgICAgcm9vbUlkLFxuICAgICAgbmFtZSxcbiAgICAgIFwiY2FtcGFpZ25cIixcbiAgICAgIHsgdzogMzIwMDAsIGg6IDE4MDAwIH0sXG4gICAgICBtaXNzaW9uSWQsXG4gICAgKTtcbiAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHVybDtcbiAgfSk7XG5cbiAgdHV0b3JpYWxCdXR0b24/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgY29uc3QgbmFtZSA9IGVuc3VyZUNhbGxTaWduKCk7XG4gICAgY29uc3QgbWFwU2l6ZSA9IGdldFNlbGVjdGVkTWFwU2l6ZSgpO1xuICAgIGNvbnN0IHJvb21JZCA9IGdlbmVyYXRlUm9vbUlkKFwidHV0b3JpYWxcIik7XG4gICAgY29uc3QgdXJsID0gYnVpbGRSb29tVXJsKHJvb21JZCwgbmFtZSwgXCJ0dXRvcmlhbFwiLCBtYXBTaXplKTtcbiAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHVybDtcbiAgfSk7XG5cbiAgZnJlZXBsYXlCdXR0b24/LmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgY29uc3QgbmFtZSA9IGVuc3VyZUNhbGxTaWduKCk7XG4gICAgY29uc3QgbWFwU2l6ZSA9IGdldFNlbGVjdGVkTWFwU2l6ZSgpO1xuICAgIGNvbnN0IHJvb21JZCA9IGdlbmVyYXRlUm9vbUlkKFwiZnJlZXBsYXlcIik7XG4gICAgY29uc3QgdXJsID0gYnVpbGRSb29tVXJsKHJvb21JZCwgbmFtZSwgXCJmcmVlcGxheVwiLCBtYXBTaXplKTtcbiAgICB3aW5kb3cubG9jYXRpb24uaHJlZiA9IHVybDtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGdldFNlbGVjdGVkTWFwU2l6ZSgpOiB7IHc6IG51bWJlcjsgaDogbnVtYmVyIH0ge1xuICBjb25zdCBzZWxlY3RlZCA9IG1hcFNpemVTZWxlY3Q/LnZhbHVlIHx8IFwibWVkaXVtXCI7XG4gIHN3aXRjaCAoc2VsZWN0ZWQpIHtcbiAgICBjYXNlIFwic21hbGxcIjpcbiAgICAgIHJldHVybiB7IHc6IDQwMDAsIGg6IDIyNTAgfTtcbiAgICBjYXNlIFwibWVkaXVtXCI6XG4gICAgICByZXR1cm4geyB3OiA4MDAwLCBoOiA0NTAwIH07XG4gICAgY2FzZSBcImxhcmdlXCI6XG4gICAgICByZXR1cm4geyB3OiAxNjAwMCwgaDogOTAwMCB9O1xuICAgIGNhc2UgXCJodWdlXCI6XG4gICAgICByZXR1cm4geyB3OiAzMjAwMCwgaDogMTgwMDAgfTtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHsgdzogODAwMCwgaDogNDUwMCB9O1xuICB9XG59XG5cbmZ1bmN0aW9uIGVuc3VyZUNhbGxTaWduKCk6IHN0cmluZyB7XG4gIGNvbnN0IGlucHV0TmFtZSA9IGNhbGxTaWduSW5wdXQgPyBjYWxsU2lnbklucHV0LnZhbHVlIDogXCJcIjtcbiAgY29uc3Qgc2FuaXRpemVkID0gc2FuaXRpemVDYWxsU2lnbihpbnB1dE5hbWUpO1xuICBpZiAoY2FsbFNpZ25JbnB1dCkge1xuICAgIGNhbGxTaWduSW5wdXQudmFsdWUgPSBzYW5pdGl6ZWQ7XG4gIH1cbiAgcGVyc2lzdENhbGxTaWduKHNhbml0aXplZCk7XG4gIHJldHVybiBzYW5pdGl6ZWQ7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVJbml0aWFsQ2FsbFNpZ24oKTogc3RyaW5nIHtcbiAgY29uc3QgZnJvbVF1ZXJ5ID0gc2FuaXRpemVDYWxsU2lnbihuZXcgVVJMU2VhcmNoUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpLmdldChcIm5hbWVcIikpO1xuICBjb25zdCBzdG9yZWQgPSBzYW5pdGl6ZUNhbGxTaWduKHJlYWRTdG9yZWRDYWxsU2lnbigpKTtcbiAgaWYgKGZyb21RdWVyeSkge1xuICAgIGlmIChmcm9tUXVlcnkgIT09IHN0b3JlZCkge1xuICAgICAgcGVyc2lzdENhbGxTaWduKGZyb21RdWVyeSk7XG4gICAgfVxuICAgIHJldHVybiBmcm9tUXVlcnk7XG4gIH1cbiAgcmV0dXJuIHN0b3JlZDtcbn1cblxuZnVuY3Rpb24gc2FuaXRpemVDYWxsU2lnbih2YWx1ZTogTWF5YmU8c3RyaW5nPik6IHN0cmluZyB7XG4gIGlmICghdmFsdWUpIHtcbiAgICByZXR1cm4gXCJcIjtcbiAgfVxuICBjb25zdCB0cmltbWVkID0gdmFsdWUudHJpbSgpO1xuICBpZiAoIXRyaW1tZWQpIHtcbiAgICByZXR1cm4gXCJcIjtcbiAgfVxuICByZXR1cm4gdHJpbW1lZC5zbGljZSgwLCAyNCk7XG59XG5cbmZ1bmN0aW9uIHBlcnNpc3RDYWxsU2lnbihuYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgdHJ5IHtcbiAgICBpZiAobmFtZSkge1xuICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKFNUT1JBR0VfS0VZLCBuYW1lKTtcbiAgICB9IGVsc2Uge1xuICAgICAgd2luZG93LmxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKFNUT1JBR0VfS0VZKTtcbiAgICB9XG4gIH0gY2F0Y2gge1xuICAgIC8qIGxvY2FsU3RvcmFnZSB1bmF2YWlsYWJsZTsgaWdub3JlICovXG4gIH1cbn1cblxuZnVuY3Rpb24gcmVhZFN0b3JlZENhbGxTaWduKCk6IHN0cmluZyB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbShTVE9SQUdFX0tFWSkgPz8gXCJcIjtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIFwiXCI7XG4gIH1cbn1cblxuZnVuY3Rpb24gYnVpbGRSb29tVXJsKFxuICByb29tSWQ6IHN0cmluZyxcbiAgY2FsbFNpZ246IHN0cmluZyxcbiAgbW9kZT86IHN0cmluZyxcbiAgbWFwU2l6ZT86IHsgdzogbnVtYmVyOyBoOiBudW1iZXIgfSxcbiAgbWlzc2lvbklkPzogc3RyaW5nLFxuKTogc3RyaW5nIHtcbiAgbGV0IHVybCA9IGAke3dpbmRvdy5sb2NhdGlvbi5vcmlnaW59Lz9yb29tPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHJvb21JZCl9YDtcbiAgaWYgKG1vZGUpIHtcbiAgICB1cmwgKz0gYCZtb2RlPSR7ZW5jb2RlVVJJQ29tcG9uZW50KG1vZGUpfWA7XG4gIH1cbiAgaWYgKG1pc3Npb25JZCkge1xuICAgIHVybCArPSBgJm1pc3Npb249JHtlbmNvZGVVUklDb21wb25lbnQobWlzc2lvbklkKX1gO1xuICB9XG4gIGlmIChjYWxsU2lnbikge1xuICAgIHVybCArPSBgJm5hbWU9JHtlbmNvZGVVUklDb21wb25lbnQoY2FsbFNpZ24pfWA7XG4gIH1cbiAgaWYgKG1hcFNpemUpIHtcbiAgICB1cmwgKz0gYCZtYXBXPSR7bWFwU2l6ZS53fSZtYXBIPSR7bWFwU2l6ZS5ofWA7XG4gIH1cbiAgcmV0dXJuIHVybDtcbn1cblxuZnVuY3Rpb24gZ2VuZXJhdGVSb29tSWQocHJlZml4Pzogc3RyaW5nKTogc3RyaW5nIHtcbiAgbGV0IHNsdWcgPSBcIlwiO1xuICB3aGlsZSAoc2x1Zy5sZW5ndGggPCA2KSB7XG4gICAgc2x1ZyA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnNsaWNlKDIsIDgpO1xuICB9XG4gIGlmIChwcmVmaXgpIHtcbiAgICByZXR1cm4gYCR7cHJlZml4fS0ke3NsdWd9YDtcbiAgfVxuICByZXR1cm4gYHItJHtzbHVnfWA7XG59XG5cbmZ1bmN0aW9uIHNob3dTYXZlU3RhdHVzKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuICBpZiAoIXNhdmVTdGF0dXMpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgc2F2ZVN0YXR1cy50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG4gIGlmIChzYXZlU3RhdHVzVGltZXIgIT09IG51bGwpIHtcbiAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHNhdmVTdGF0dXNUaW1lcik7XG4gIH1cbiAgc2F2ZVN0YXR1c1RpbWVyID0gd2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuICAgIGlmIChzYXZlU3RhdHVzKSB7XG4gICAgICBzYXZlU3RhdHVzLnRleHRDb250ZW50ID0gXCJcIjtcbiAgICB9XG4gICAgc2F2ZVN0YXR1c1RpbWVyID0gbnVsbDtcbiAgfSwgMjAwMCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQThGTyxXQUFTLGlCQUEyQjtBQUN6QyxVQUFNLFdBQVcsb0JBQUksSUFBNkI7QUFDbEQsV0FBTztBQUFBLE1BQ0wsR0FBRyxPQUFPLFNBQVM7QUFDakIsWUFBSSxNQUFNLFNBQVMsSUFBSSxLQUFLO0FBQzVCLFlBQUksQ0FBQyxLQUFLO0FBQ1IsZ0JBQU0sb0JBQUksSUFBSTtBQUNkLG1CQUFTLElBQUksT0FBTyxHQUFHO0FBQUEsUUFDekI7QUFDQSxZQUFJLElBQUksT0FBTztBQUNmLGVBQU8sTUFBTSxJQUFLLE9BQU8sT0FBTztBQUFBLE1BQ2xDO0FBQUEsTUFDQSxLQUFLLE9BQWlCLFNBQW1CO0FBQ3ZDLGNBQU0sTUFBTSxTQUFTLElBQUksS0FBSztBQUM5QixZQUFJLENBQUMsT0FBTyxJQUFJLFNBQVMsRUFBRztBQUM1QixtQkFBVyxNQUFNLEtBQUs7QUFDcEIsY0FBSTtBQUNGLFlBQUMsR0FBaUMsT0FB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QUFFLENBQUMsR0FBRyxjQUFjLENBQUMsRUFBRSxRQUFRLGVBQWUsU0FBUyxDQUFDLEVBQUUsUUFBUSxVQUFVLFVBQVUsR0FBRyxRQUFRLEdBQUcsU0FBUyxFQUFFLEdBQUcsRUFBRSxRQUFRLGFBQWEsVUFBVSxHQUFHLFFBQVEsR0FBRyxTQUFTLEVBQUUsR0FBRyxFQUFFLFFBQVEsUUFBUSxVQUFVLEdBQUcsUUFBUSxHQUFHLFNBQVMsRUFBRSxHQUFHLEVBQUUsUUFBUSxZQUFZLFVBQVUsR0FBRyxRQUFRLEdBQUcsU0FBUyxFQUFFLEdBQUcsRUFBRSxRQUFRLFlBQVksVUFBVSxHQUFHLFFBQVEsR0FBRyxTQUFTLEVBQUUsQ0FBQyxFQUFFLENBQUMsR0FBRyxZQUFZLENBQUMsRUFBRSxRQUFRLHFCQUFxQixTQUFTLENBQUMsRUFBRSxRQUFRLGVBQWUsVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLGNBQWMsVUFBVSxFQUFFLENBQUMsRUFBRSxDQUFDLEdBQUcsa0JBQWtCLENBQUMsRUFBRSxTQUFTLEtBQU0sT0FBTyxVQUFVLENBQUMsRUFBRSxHQUFHLEVBQUUsUUFBUSx3QkFBd0IsU0FBUyxDQUFDLEVBQUUsUUFBUSxRQUFRLFVBQVUsR0FBRyxRQUFRLEdBQUcsU0FBUyxFQUFFLEdBQUcsRUFBRSxRQUFRLFVBQVUsVUFBVSxHQUFHLFFBQVEsR0FBRyxTQUFTLEVBQUUsR0FBRyxFQUFFLFFBQVEsU0FBUyxVQUFVLEdBQUcsUUFBUSxJQUFJLFNBQVMsR0FBRyxZQUFZLDhDQUE4QyxHQUFHLEVBQUUsUUFBUSxRQUFRLFVBQVUsR0FBRyxRQUFRLElBQUksU0FBUyxHQUFHLFlBQVksNkNBQTZDLEdBQUcsRUFBRSxRQUFRLGFBQWEsVUFBVSxHQUFHLFFBQVEsR0FBRyxTQUFTLEVBQUUsR0FBRyxFQUFFLFFBQVEsWUFBWSxVQUFVLEdBQUcsUUFBUSxHQUFHLFNBQVMsRUFBRSxHQUFHLEVBQUUsUUFBUSxpQkFBaUIsVUFBVSxHQUFHLFFBQVEsR0FBRyxTQUFTLEVBQUUsR0FBRyxFQUFFLFFBQVEsZUFBZSxVQUFVLEdBQUcsUUFBUSxHQUFHLFNBQVMsRUFBRSxHQUFHLEVBQUUsUUFBUSxhQUFhLFVBQVUsSUFBSSxRQUFRLEdBQUcsU0FBUyxFQUFFLEdBQUcsRUFBRSxRQUFRLFdBQVcsVUFBVSxHQUFHLFFBQVEsSUFBSSxTQUFTLEdBQUcsWUFBWSxnQ0FBZ0MsR0FBRyxFQUFFLFFBQVEsbUJBQW1CLFVBQVUsSUFBSSxRQUFRLEdBQUcsU0FBUyxFQUFFLENBQUMsR0FBRyxZQUFZLENBQUMsRUFBRSxRQUFRLFFBQVEsU0FBUyxDQUFDLEVBQUUsUUFBUSxlQUFlLFVBQVUsRUFBRSxHQUFHLEVBQUUsUUFBUSxjQUFjLFVBQVUsRUFBRSxHQUFHLEVBQUUsUUFBUSxjQUFjLFVBQVUsRUFBRSxHQUFHLEVBQUUsUUFBUSxlQUFlLFVBQVUsRUFBRSxHQUFHLEVBQUUsUUFBUSxjQUFjLFVBQVUsRUFBRSxHQUFHLEVBQUUsUUFBUSxnQkFBZ0IsVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLGdCQUFnQixVQUFVLEVBQUUsR0FBRyxFQUFFLFFBQVEsYUFBYSxVQUFVLEVBQUUsR0FBRyxFQUFFLFFBQVEsZUFBZSxVQUFVLEVBQUUsR0FBRyxFQUFFLFFBQVEsY0FBYyxVQUFVLEdBQUcsR0FBRyxFQUFFLFFBQVEsZ0JBQWdCLFVBQVUsR0FBRyxHQUFHLEVBQUUsUUFBUSxjQUFjLFVBQVUsR0FBRyxHQUFHLEVBQUUsUUFBUSxlQUFlLFVBQVUsR0FBRyxHQUFHLEVBQUUsUUFBUSxhQUFhLFVBQVUsR0FBRyxHQUFHLEVBQUUsUUFBUSxpQkFBaUIsVUFBVSxHQUFHLEdBQUcsRUFBRSxRQUFRLGlCQUFpQixVQUFVLEdBQUcsR0FBRyxFQUFFLFFBQVEsZUFBZSxVQUFVLEdBQUcsR0FBRyxFQUFFLFFBQVEsZUFBZSxVQUFVLEdBQUcsQ0FBQyxFQUFFLEdBQUcsRUFBRSxRQUFRLFNBQVMsU0FBUyxDQUFDLEVBQUUsUUFBUSxrQkFBa0IsVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLGtCQUFrQixVQUFVLEVBQUUsR0FBRyxFQUFFLFFBQVEsa0JBQWtC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QUUsUUFBUSxpQkFBaUIsU0FBUyxDQUFDLEVBQUUsUUFBUSwwQkFBMEIsVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLFlBQVksVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLFlBQVksVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLG1CQUFtQixVQUFVLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxRQUFRLFlBQVksU0FBUyxDQUFDLEVBQUUsUUFBUSxxQkFBcUIsVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLFFBQVEsVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLFVBQVUsVUFBVSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsUUFBUSx5QkFBeUIsU0FBUyxDQUFDLEVBQUUsUUFBUSxtQ0FBbUMsVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLFVBQVUsVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLFlBQVksVUFBVSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsUUFBUSxrQkFBa0IsU0FBUyxDQUFDLEVBQUUsUUFBUSwyQkFBMkIsVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLFVBQVUsVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLFFBQVEsVUFBVSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsUUFBUSxtQkFBbUIsU0FBUyxDQUFDLEVBQUUsUUFBUSw0QkFBNEIsVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLG1CQUFtQixVQUFVLEVBQUUsR0FBRyxFQUFFLFFBQVEsYUFBYSxVQUFVLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxRQUFRLGNBQWMsU0FBUyxDQUFDLEVBQUUsUUFBUSx1QkFBdUIsVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLFNBQVMsVUFBVSxFQUFFLEdBQUcsRUFBRSxRQUFRLHNCQUFzQixVQUFVLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxRQUFRLHNCQUFzQixTQUFTLENBQUMsRUFBRSxRQUFRLGdDQUFnQyxVQUFVLEVBQUUsR0FBRyxFQUFFLFFBQVEsYUFBYSxVQUFVLEVBQUUsR0FBRyxFQUFFLFFB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Q0FBQyxZQUFZO0FBQ2Y7QUFBQSxRQUNGO0FBQ0EsbUJBQVcsY0FBYztBQUN6QixZQUFJLG9CQUFvQixNQUFNO0FBQzVCLGlCQUFPLGFBQWEsZUFBZTtBQUFBLFFBQ3JDO0FBQ0EsMEJBQWtCLE9BQU8sV0FBVyxNQUFNO0FBQ3hDLGNBQUksWUFBWTtBQUNkLHVCQUFXLGNBQWM7QUFBQSxVQUMzQjtBQUNBLDRCQUFrQjtBQUFBLFFBQ3BCLEdBQUcsR0FBSTtBQUFBLE1BQ1Q7QUFBQTtBQUFBOyIsCiAgIm5hbWVzIjogWyJTY2FsYXJUeXBlIiwgIl9hIiwgIklNUExJQ0lUIiwgImJvb3QiLCAiaXNNZXNzYWdlIiwgIm1lc3NhZ2VEZXNjIiwgIldpcmVUeXBlIiwgIm1lc3NhZ2VEZXNjIiwgIm1lc3NhZ2VEZXNjIiwgIklNUExJQ0lUIiwgIkVESVRJT05fUFJPVE8zIiwgIkVESVRJT05fUFJPVE8yIiwgIm1lc3NhZ2VEZXNjIiwgIkxFR0FDWV9SRVFVSVJFRCIsICJFeHRlbnNpb25SYW5nZU9wdGlvbnNfVmVyaWZpY2F0aW9uU3RhdGUiLCAiRmllbGREZXNjcmlwdG9yUHJvdG9fVHlwZSIsICJGaWVsZERlc2NyaXB0b3JQcm90b19MYWJlbCIsICJGaWxlT3B0aW9uc19PcHRpbWl6ZU1vZGUiLCAiRmllbGRPcHRpb25zX0NUeXBlIiwgIkZpZWxkT3B0aW9uc19KU1R5cGUiLCAiRmllbGRPcHRpb25zX09wdGlvblJldGVudGlvbiIsICJGaWVsZE9wdGlvbnNfT3B0aW9uVGFyZ2V0VHlwZSIsICJNZXRob2RPcHRpb25zX0lkZW1wb3RlbmN5TGV2ZWwiLCAiRmVhdHVyZVNldF9WaXNpYmlsaXR5RmVhdHVyZV9EZWZhdWx0U3ltYm9sVmlzaWJpbGl0eSIsICJGZWF0dXJlU2V0X0ZpZWxkUHJlc2VuY2UiLCAiRmVhdHVyZVNldF9FbnVtVHlwZSIsICJGZWF0dXJlU2V0X1JlcGVhdGVkRmllbGRFbmNvZGluZyIsICJGZWF0dXJlU2V0X1V0ZjhWYWxpZGF0aW9uIiwgIkZlYXR1cmVTZXRfTWVzc2FnZUVuY29kaW5nIiwgIkZlYXR1cmVTZXRfSnNvbkZvcm1hdCIsICJGZWF0dXJlU2V0X0VuZm9yY2VOYW1pbmdTdHlsZSIsICJHZW5lcmF0ZWRDb2RlSW5mb19Bbm5vdGF0aW9uX1NlbWFudGljIiwgIkVkaXRpb24iLCAiU3ltYm9sVmlzaWJpbGl0eSIsICJpbml0X3NjYWxhciIsICJpbml0X3NjYWxhciIsICJpbml0X3R5cGVzIiwgImluaXRfdHlwZXMiXQp9Cg==
