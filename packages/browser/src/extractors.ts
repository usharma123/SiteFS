import type { ButtonInfo, FormInfo, InputInfo, LinkInfo } from "@sitefs/sitefs";

export interface ExtractedPageState {
  visibleText: string;
  dom: unknown;
  links: LinkInfo[];
  buttons: ButtonInfo[];
  inputs: InputInfo[];
  forms: FormInfo[];
  a11yIssues: Array<{ code: string; message: string; selector?: string }>;
}

export const extractorScript = (): ExtractedPageState => {
  const visible = (el: Element): boolean => {
    const element = el as HTMLElement;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
  };

  const cssPath = (el: Element): string => {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 6) {
      let part = node.tagName.toLowerCase();
      const name = node.getAttribute("name");
      const type = node.getAttribute("type");
      if (name) part += `[name="${CSS.escape(name)}"]`;
      else if (type) part += `[type="${CSS.escape(type)}"]`;
      else {
        const parent = node.parentElement;
        if (parent) {
          const siblings = [...parent.children].filter((child) => child.tagName === node!.tagName);
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
        }
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(" > ");
  };

  const textOf = (el: Element | null): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
  const labelFor = (input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string => {
    if (input.id) {
      const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (label) return textOf(label);
    }
    const wrappingLabel = input.closest("label");
    if (wrappingLabel) return textOf(wrappingLabel);
    const aria = input.getAttribute("aria-label") || input.getAttribute("placeholder");
    return aria ?? input.getAttribute("name") ?? "";
  };

  const toDom = (el: Element, depth = 0): unknown => {
    const children = depth >= 4 ? [] : [...el.children].slice(0, 80).map((child) => toDom(child, depth + 1));
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      class: el.className && typeof el.className === "string" ? el.className : undefined,
      role: el.getAttribute("role") || undefined,
      name: el.getAttribute("name") || undefined,
      text: textOf(el).slice(0, 240) || undefined,
      children
    };
  };

  const inputElements = [...document.querySelectorAll("input, textarea, select")] as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
  const inputs: InputInfo[] = inputElements.map((input) => ({
    label: labelFor(input),
    name: input.getAttribute("name") ?? "",
    type: input instanceof HTMLInputElement ? input.type : input.tagName.toLowerCase(),
    required: input.required,
    selector: cssPath(input),
    visible: visible(input),
    enabled: !input.disabled,
    value: input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement ? input.value : undefined
  }));

  const buttons: ButtonInfo[] = [...document.querySelectorAll("button, input[type=button], input[type=submit], input[type=reset], [role=button]")]
    .map((button) => ({
      text: textOf(button) || (button as HTMLInputElement).value || button.getAttribute("aria-label") || "",
      role: button.getAttribute("role") || "button",
      selector: cssPath(button),
      visible: visible(button),
      enabled: !(button as HTMLButtonElement).disabled
    }));

  const links: LinkInfo[] = [...document.querySelectorAll("a[href]")]
    .map((link) => ({
      text: textOf(link),
      href: (link as HTMLAnchorElement).href,
      visible: visible(link)
    }));

  const forms: FormInfo[] = [...document.querySelectorAll("form")].map((form, index) => {
    const fields = [...form.querySelectorAll("input, textarea, select")] as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
    const submit = form.querySelector("button[type=submit], input[type=submit], button:not([type])");
    return {
      name: form.getAttribute("name") || form.id || `form-${index + 1}`,
      selector: cssPath(form),
      fields: fields.map((field) => inputs.find((input) => input.selector === cssPath(field))!).filter(Boolean),
      submit: submit ? { text: textOf(submit) || (submit as HTMLInputElement).value || "Submit", selector: cssPath(submit) } : undefined
    };
  });

  const a11yIssues = [
    ...inputElements
      .filter((input) => visible(input) && !labelFor(input))
      .map((input) => ({ code: "input-missing-label", message: "Visible input has no accessible label.", selector: cssPath(input) })),
    ...[...document.querySelectorAll("img")]
      .filter((img) => visible(img) && !img.getAttribute("alt"))
      .map((img) => ({ code: "image-missing-alt", message: "Visible image has no alt text.", selector: cssPath(img) })),
    ...buttons
      .filter((button) => button.visible && !button.text)
      .map((button) => ({ code: "button-missing-name", message: "Visible button has no accessible name.", selector: button.selector }))
  ];

  return {
    visibleText: (document.body?.innerText ?? "").replace(/\n{3,}/g, "\n\n").trim() + "\n",
    dom: document.documentElement ? toDom(document.documentElement) : null,
    links,
    buttons,
    inputs,
    forms,
    a11yIssues
  };
};

