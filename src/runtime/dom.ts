/** Form fields and dynamic content remain controller-owned leaves during the fidelity migration. */
export type MockElement = HTMLElement & {
  value: string;
  disabled: boolean;
  checked: boolean;
  placeholder: string;
  _h?: number;
};

export function query(selector: string): MockElement {
  return document.querySelector<MockElement>(selector);
}

export function queryAll(selector: string): MockElement[] {
  return Array.from(document.querySelectorAll<MockElement>(selector));
}
