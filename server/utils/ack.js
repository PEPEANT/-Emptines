export function ack(ackFn, payload) {
  if (typeof ackFn === "function") {
    ackFn(payload);
  }
}
