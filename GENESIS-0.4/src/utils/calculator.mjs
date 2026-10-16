// Display-only calculator: no eval(), no API call, no ledger writes.
export function calculate(expression) {
  if (typeof expression !== 'string' || expression.length > 80 || !/^[0-9.\s()+\-*/]+$/.test(expression)) {
    throw new Error('CALCULATOR_INVALID');
  }
  const tokens = expression.match(/\d+(?:\.\d*)?|\.\d+|[()+\-*/]/g) || [];
  if (tokens.join('') !== expression.replace(/\s/g, '')) throw new Error('CALCULATOR_INVALID');
  const output = [], operators = [];
  const precedence = { '+': 1, '-': 1, '*': 2, '/': 2, 'u-': 3 };
  let expectNumber = true;
  for (const token of tokens) {
    if (/^(?:\d|\.)/.test(token)) {
      if (!expectNumber) throw new Error('CALCULATOR_INVALID');
      const n = Number(token);
      if (!Number.isFinite(n)) throw new Error('CALCULATOR_INVALID');
      output.push(n); expectNumber = false;
    } else if (token === '(') {
      if (!expectNumber) throw new Error('CALCULATOR_INVALID');
      operators.push(token);
    } else if (token === ')') {
      if (expectNumber) throw new Error('CALCULATOR_INVALID');
      while (operators.length && operators.at(-1) !== '(') output.push(operators.pop());
      if (!operators.length) throw new Error('CALCULATOR_INVALID');
      operators.pop(); expectNumber = false;
    } else {
      if (expectNumber && token !== '-') throw new Error('CALCULATOR_INVALID');
      const op = expectNumber ? 'u-' : token;
      while (operators.length && operators.at(-1) !== '(' &&
        (precedence[operators.at(-1)] > precedence[op] ||
         (precedence[operators.at(-1)] === precedence[op] && op !== 'u-'))) {
        output.push(operators.pop());
      }
      operators.push(op); expectNumber = true;
    }
  }
  if (expectNumber) throw new Error('CALCULATOR_INVALID');
  while (operators.length) {
    const op = operators.pop();
    if (op === '(') throw new Error('CALCULATOR_INVALID');
    output.push(op);
  }
  const stack = [];
  for (const token of output) {
    if (typeof token === 'number') stack.push(token);
    else if (token === 'u-') {
      if (!stack.length) throw new Error('CALCULATOR_INVALID');
      stack.push(-stack.pop());
    } else {
      if (stack.length < 2) throw new Error('CALCULATOR_INVALID');
      const right = stack.pop(), left = stack.pop();
      if (token === '/' && right === 0) throw new Error('CALCULATOR_DIV_ZERO');
      stack.push(token === '+' ? left + right : token === '-' ? left - right :
        token === '*' ? left * right : left / right);
    }
  }
  if (stack.length !== 1 || !Number.isFinite(stack[0])) throw new Error('CALCULATOR_INVALID');
  return Math.round((stack[0] + Number.EPSILON) * 1e8) / 1e8;
}
