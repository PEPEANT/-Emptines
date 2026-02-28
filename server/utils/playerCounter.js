export function createPlayerCounter() {
  let count = 0;

  return {
    increment() {
      count += 1;
      return count;
    },
    decrement() {
      count = Math.max(0, count - 1);
      return count;
    },
    get() {
      return count;
    }
  };
}
