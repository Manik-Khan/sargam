// Start the first operation synchronously (file pickers need the user gesture),
// then serialize subsequent writes so older snapshots cannot finish last.
export function createSerialWrites() {
  const pending = [];
  let active = false;
  const next = () => {
    if (active || !pending.length) return;
    active = true;
    const { operation, resolve, reject } = pending.shift();
    let result;
    try { result = operation(); } catch (error) { result = Promise.reject(error); }
    Promise.resolve(result).then(resolve, reject).finally(() => { active = false; next(); });
  };
  return { run(operation) { return new Promise((resolve, reject) => { pending.push({ operation, resolve, reject }); next(); }); } };
}
