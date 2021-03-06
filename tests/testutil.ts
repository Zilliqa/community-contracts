export const extractTypes = (type) => {
  let count = 0;
  let startIndex = -1;
  const result = [] as string[];

  for (let i = 0; i < type.length; i++) {
    const c = type[i] as string;

    if (c === "(") {
      count += 1;
      if (count === 1 && startIndex === -1) {
        startIndex = i + 1;
      }
    } else if (c === ")") {
      count -= 1;
      if (count === 0) {
        result.push(type.slice(startIndex, i));

        // reset
        startIndex = -1;
      }
    }
  }
  return result;
};

export const getJSONValue = (value, type?) => {
  if (typeof type === "string" && type.startsWith("Uint")) {
    return value.toString();
  }

  if (typeof type === "string" && type.startsWith("Int")) {
    return value.toString();
  }

  if (type === "String") {
    return value;
  }

  if (
    typeof type === "string" &&
    type.startsWith("ByStr") &&
    typeof value === "string"
  ) {
    return value.toLowerCase();
  }

  if (type === "BNum") {
    return value.toString();
  }

  if (typeof value === "boolean") {
    return {
      argtypes: [],
      arguments: [],
      constructor: value ? "True" : "False",
    };
  }

  if (typeof type === "string" && type.startsWith("Option")) {
    const types = extractTypes(type);
    return {
      argtypes: types,
      arguments: value === undefined ? [] : [getJSONValue(value, types[0])],
      constructor: value === undefined ? "None" : "Some",
    };
  }

  if (
    typeof type === "string" &&
    type.startsWith("List") &&
    Array.isArray(value)
  ) {
    return value.map((x) => getJSONValue(x, extractTypes(type)[0]));
  }

  if (
    typeof type === "string" &&
    type.startsWith("Pair") &&
    Array.isArray(value)
  ) {
    const types = extractTypes(type);
    return {
      argtypes: types,
      arguments: value.map((x, i) => getJSONValue(x, types[i])),
      constructor: "Pair",
    };
  }

  return value;
};

const logDelta = (want, got) =>
  console.log(
    "\x1b[32m",
    `\nExpected: ${want}`,
    "\x1b[31m",
    `\nReceived: ${got}`
  );

export const getJSONParams = (obj) => {
  const result = Object.keys(obj).map((vname) => {
    const [type, value] = obj[vname];
    return {
      type,
      value: getJSONValue(value, type),
      vname,
    };
  });
  return result;
};

export const verifyCheckRewardsEvents = (events, want) => {
  if (events === undefined) {
    return want === undefined;
  }

  for (const [index, event] of events.entries()) {
    if (want[index] === undefined) {
      // just skip
      continue;
    }
    if (event._eventname !== want[index].name) {
      logDelta(want[index].name, event._eventname);
      return false;
    }

    const wantParams = getJSONParams(want[index].getParams());

    if (Array.isArray(event.params) && Array.isArray(wantParams)) {
      event.params.map((e) => {
        e.value.sort((a, b) => (a.arguments[0] < b.arguments[0] ? 1 : -1));
      });

      wantParams.map((e) => {
        e.value.sort((a, b) => (a.arguments[0] < b.arguments[0] ? 1 : -1));
      });
    }

    if (JSON.stringify(event.params) !== JSON.stringify(wantParams)) {
      logDelta(JSON.stringify(wantParams), JSON.stringify(event.params));
      return false;
    }
  }
  return true;
};

export const verifyEvents = (events, want) => {
  if (events === undefined) {
    return want === undefined;
  }

  for (const [index, event] of events.entries()) {
    if (want[index] === undefined) {
      // just skip
      continue;
    }
    if (event._eventname !== want[index].name) {
      logDelta(want[index].name, event._eventname);
      return false;
    }

    const wantParams = getJSONParams(want[index].getParams());
    if (JSON.stringify(event.params) !== JSON.stringify(wantParams)) {
      logDelta(JSON.stringify(wantParams), JSON.stringify(event.params));
      return false;
    }
  }
  return true;
};

export const verifyTransitions = (transitions, want) => {
  if (transitions === undefined) {
    return want === undefined;
  }
  for (const [index, transition] of transitions.entries()) {
    const { msg } = transition;

    if (want[index].amount && msg._amount !== want[index].amount.toString()) {
      logDelta(want[index].amount.toString(), msg._amount);
      return false;
    }

    if (want[index].recipient && msg._recipient !== want[index].recipient) {
      logDelta(want[index].recipient, msg._recipient);
      return false;
    }

    if (msg._tag !== want[index].tag) {
      logDelta(want[index].tag, msg._tag);
      return false;
    }

    const wantParams = getJSONParams(want[index].getParams());

    if (JSON.stringify(msg.params) !== JSON.stringify(wantParams)) {
      logDelta(wantParams, JSON.stringify(msg.params));
      return false;
    }
  }
  return true;
};

export const getErrorMsg = (code) =>
  `Exception thrown: (Message [(_exception : (String "Error")) ; (code : (Int32 ${code}))])`;

export const getBNum = async (zilliqa) => {
  const response = await zilliqa.provider.send("GetBlocknum", "");
  return Number(response.result);
};

export const increaseBNum = async (zilliqa, n) =>
  zilliqa.provider.send("IncreaseBlocknum", n);
