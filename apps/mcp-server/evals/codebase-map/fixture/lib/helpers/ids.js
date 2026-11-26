/** Returns a function that gives a new id with the prefix each time it is called: loan_1, loan_2, ... */
export function createIdGenerator(prefix) {
  let count = 0;
  return () => {
    count += 1;
    return `${prefix}_${count}`;
  };
}
