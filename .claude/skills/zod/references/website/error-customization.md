Customizing errors | Zod

💎 Zod 4 is now stable!  [Read the announcement.](/v4)

[![Zod logo](/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Flogo-white.d29d7ce8.png&w=3840&q=75)![Zod logo](/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Flogo.34ce4c58.png&w=3840&q=75)](/)

[![Zod logo](/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Flogo-white.d29d7ce8.png&w=3840&q=75)![Zod logo](/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Flogo.34ce4c58.png&w=3840&q=75)](/)

![Zod 4](/_next/image?url=%2Flogo%2Flogo.png&w=48&q=100)

Zod 4

The latest version of Zod

Search

`⌘``K`

Zod 4

[Release notes](/v4)[Migration guide](/v4/changelog)

Documentation

[Intro](/)[Basic usage](/basics)[Defining schemas](/api)[Customizing errors](/error-customization)[Formatting errors](/error-formatting)[Metadata and registries

New](/metadata)[JSON Schema

New](/json-schema)[Codecs

New](/codecs)[Ecosystem](/ecosystem)[For library authors](/library-authors)

Packages

[Zod](/packages/zod)[Zod Mini

New](/packages/mini)[Zod Core

New](/packages/core)

[github logo](https://github.com/colinhacks/zod)

On this page

# Customizing errors

Copy markdown

[Edit this page](https://github.com/colinhacks/zod/edit/main/packages/docs/content/error-customization.mdx)

In Zod, validation errors are surfaced as instances of the `z.core.$ZodError` class.

The `ZodError` class in the `zod` package is a subclass that implements some additional convenience methods.

Instances of `$ZodError` contain an `.issues` array. Each issue contains a human-readable `message` and additional structured metadata about the issue.

ZodZod Mini

```
import * as z from "zod";
 
const result = z.string().safeParse(12); // { success: false, error: ZodError }
result.error.issues;
// [
//   {
//     expected: 'string',
//     code: 'invalid_type',
//     path: [],
//     message: 'Invalid input: expected string, received number'
//   }
// ]
```

Every issue contains a `message` property with a human-readable error message. Error messages can be customized in a number of ways.

## [The `error` param](?id=the-error-param)

Virtually every Zod API accepts an optional error message.

```
z.string("Not a string!");
```

This custom error will show up as the `message` property of any validation issues that originate from this schema.

```
z.string("Not a string!").parse(12);
// ❌ throws ZodError {
//   issues: [
//     {
//       expected: 'string',
//       code: 'invalid_type',
//       path: [],
//       message: 'Not a string!'   <-- 👀 custom error message
//     }
//   ]
// }
```

All `z` functions and schema methods accept custom errors.

ZodZod Mini

```
z.string("Bad!");
z.string().min(5, "Too short!");
z.uuid("Bad UUID!");
z.iso.date("Bad date!");
z.array(z.string(), "Not an array!");
z.array(z.string()).min(5, "Too few items!");
z.set(z.string(), "Bad set!");
```

If you prefer, you can pass a params object with an `error` parameter instead.

ZodZod Mini

```
z.string({ error: "Bad!" });
z.string().min(5, { error: "Too short!" });
z.uuid({ error: "Bad UUID!" });
z.iso.date({ error: "Bad date!" });
z.array(z.string(), { error: "Bad array!" });
z.array(z.string()).min(5, { error: "Too few items!" });
z.set(z.string(), { error: "Bad set!" });
```

The `error` param optionally accepts a function. An error customization function is known as an **error map** in Zod terminology. The error map will run at parse time if a validation error occurs.

```
z.string({ error: ()=>`[${Date.now()}]: Validation failure.` });
```

**Note** — In Zod v3, there were separate params for `message` (a string) and `errorMap` (a function). These have been unified in Zod 4 as `error`.

The error map receives a context object you can use to customize the error message based on the validation issue.

```
z.string({
  error: (iss) => iss.input === undefined ? "Field is required." : "Invalid input."
});
```

For advanced cases, the `iss` object provides additional information you can use to customize the error.

```
z.string({
  error: (iss) => {
    iss.code; // the issue code
    iss.input; // the input data
    iss.inst; // the schema/check that originated this issue
    iss.path; // the path of the error
  },
});
```

Depending on the API you are using, there may be additional properties available. Use TypeScript's autocomplete to explore the available properties.

```
z.string().min(5, {
  error: (iss) => {
    // ...the same as above
    iss.minimum; // the minimum value
    iss.inclusive; // whether the minimum is inclusive
    return `Password must have ${iss.minimum} characters or more`;
  },
});
```

Return `undefined` to avoid customizing the error message and fall back to the default message. (More specifically, Zod will yield control to the next error map in the [precedence chain](#error-precedence).) This is useful for selectively customizing certain error messages but not others.

```
z.int64({
  error: (issue) => {
    // override too_big error message
    if (issue.code === "too_big") {
      return { message: `Value must be <${issue.maximum}` };
    }
 
    //  defer to default
    return undefined;
  },
});
```

## [Per-parse error customization](?id=per-parse-error-customization)

To customize errors on a *per-parse* basis, pass an error map into the parse method:

```
const schema = z.string();
 
schema.parse(12, {
  error: iss => "per-parse custom error"
});
```

This has *lower precedence* than any schema-level custom messages.

```
const schema = z.string({ error: "highest priority" });
const result = schema.safeParse(12, {
  error: (iss) => "lower priority",
});
 
result.error.issues;
// [{ message: "highest priority", ... }]
```

The `iss` object is a [discriminated union](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions) of all possible issue types. Use the `code` property to discriminate between them.

For a breakdown of all Zod issue codes, see the [`zod/v4/core`](/packages/core#issue-types) documentation.

```
const result = schema.safeParse(12, {
  error: (iss) => {
    if (iss.code === "invalid_type") {
      return `invalid type, expected ${iss.expected}`;
    }
    if (iss.code === "too_small") {
      return `minimum is ${iss.minimum}`;
    }
    // ...
  }
});
```

### [Include input in issues](?id=include-input-in-issues)

By default, Zod does not include input data in issues. This is to prevent unintentional logging of potentially sensitive input data. To include the input data in each issue, use the `reportInput` flag:

```
z.string().parse(12, {
  reportInput: true
})
 
// ZodError: [
//   {
//     "expected": "string",
//     "code": "invalid_type",
//     "input": 12, // 👀
//     "path": [],
//     "message": "Invalid input: expected string, received number"
//   }
// ]
```

## [Global error customization](?id=global-error-customization)

To specify a global error map, use `z.config()` to set Zod's `customError` configuration setting:

```
z.config({
  customError: (iss) => {
    return "globally modified error";
  },
});
```

Global error messages have *lower precedence* than schema-level or per-parse error messages.

The `iss` object is a [discriminated union](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions) of all possible issue types. Use the `code` property to discriminate between them.

For a breakdown of all Zod issue codes, see the [`zod/v4/core`](/packages/core#issue-types) documentation.

```
z.config({
  customError: (iss) => {
    if (iss.code === "invalid_type") {
      return `invalid type, expected ${iss.expected}`;
    }
    if (iss.code === "too_small") {
      return `minimum is ${iss.minimum}`;
    }
    // ...
  },
});
```

## [Internationalization](?id=internationalization)

To support internationalization of error message, Zod provides several built-in **locales**. These are exported from the `zod/v4/core` package.

**Note** — The regular `zod` library loads the `en` locale automatically. Zod Mini does not load any locale by default; instead all error messages default to `Invalid input`.

ZodZod Mini

```
import * as z from "zod";
import { en } from "zod/locales"
 
z.config(en());
```

To lazily load a locale, consider dynamic imports:

```
import * as z from "zod";
 
async function loadLocale(locale: string) {
  const { default: locale } = await import(`zod/v4/locales/${locale}.js`);
  z.config(locale());
};
 
await loadLocale("fr");
```

For convenience, all locales are exported as `z.locales` from `"zod"`. In some bundlers, this may not be tree-shakable.

ZodZod Mini

```
import * as z from "zod";
 
z.config(z.locales.en());
```

### [Locales](?id=locales)

The following locales are available:

* `ar` — Arabic
* `az` — Azerbaijani
* `be` — Belarusian
* `bg` — Bulgarian
* `ca` — Catalan
* `cs` — Czech
* `da` — Danish
* `de` — German
* `en` — English
* `eo` — Esperanto
* `es` — Spanish
* `fa` — Farsi
* `fi` — Finnish
* `fr` — French
* `frCA` — Canadian French
* `he` — Hebrew
* `hu` — Hungarian
* `hy` — Armenian
* `id` — Indonesian
* `is` — Icelandic
* `it` — Italian
* `ja` — Japanese
* `ka` — Georgian
* `km` — Khmer
* `ko` — Korean
* `lt` — Lithuanian
* `mk` — Macedonian
* `ms` — Malay
* `nl` — Dutch
* `no` — Norwegian
* `ota` — Türkî
* `ps` — Pashto
* `pl` — Polish
* `pt` — Portuguese
* `ru` — Russian
* `sl` — Slovenian
* `sv` — Swedish
* `ta` — Tamil
* `th` — Thai
* `tr` — Türkçe
* `uk` — Ukrainian
* `ur` — Urdu
* `uz` — Uzbek
* `vi` — Tiếng Việt
* `zhCN` — Simplified Chinese
* `zhTW` — Traditional Chinese
* `yo` — Yorùbá

## [Error precedence](?id=error-precedence)

Below is a quick reference for determining error precedence: if multiple error customizations have been defined, which one takes priority? From *highest to lowest* priority:

1. **Schema-level error** — Any error message "hard coded" into a schema definition.

```
z.string("Not a string!");
```

2. **Per-parse error** — A custom error map passed into the `.parse()` method.

```
z.string().parse(12, {
  error: (iss) => "My custom error"
});
```

3. **Global error map** — A custom error map passed into `z.config()`.

```
z.config({
  customError: (iss) => "My custom error"
});
```

4. **Locale error map** — A custom error map passed into `z.config()`.

```
z.config(z.locales.en());
```

[Defining schemas

Complete API reference for all Zod schema types, methods, and validation features](/api)[Formatting errors

Utilities for formatting and displaying Zod errors](/error-formatting)

### On this page

[The `error` param](#the-error-param)[Per-parse error customization](#per-parse-error-customization)[Include input in issues](#include-input-in-issues)[Global error customization](#global-error-customization)[Internationalization](#internationalization)[Locales](#locales)[Error precedence](#error-precedence)