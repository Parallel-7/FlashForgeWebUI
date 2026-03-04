For library authors | Zod

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

# For library authors

Copy markdown

[Edit this page](https://github.com/colinhacks/zod/edit/main/packages/docs/content/library-authors.mdx)

Update — July 10th, 2025

Zod `4.0.0` has been released on `npm`. This completes the incremental rollout process described below. To add support, bump your peer dependency to include `zod@^4.0.0`:

```
// package.json
{
  "peerDependencies": {
    "zod": "^3.25.0 || ^4.0.0"
  }
}
```

If you'd already implemented Zod 4 support according to the best practices described below (e.g. using the `"zod/v4/core"` subpath), then no other code changes should be necessary. This should not require a major version bump in your library.

This page is primarily intended for consumption by *library authors* who are building tooling on top of Zod.

If you are a library author and think this page should include some additional guidance, please open an issue!

## [Do I need to depend on Zod?](?id=do-i-need-to-depend-on-zod)

First things first, make sure you need to depend on Zod at all.

If you're building a library that accepts user-defined schemas to perform black-box validation, you may not need to integrate with Zod specifically. Instead look into [Standard Schema](https://standardschema.dev/). It's a shared interface implemented by most popular validation libraries in the TypeScript ecosystem (see the [full list](https://standardschema.dev/#what-schema-libraries-implement-the-spec)), including Zod.

This spec works great if you accept user-defined schemas and treat them like "black box" validators. Given any compliant library, you can extract inferred input/output types, validate inputs, and get back a standardized error.

If you need Zod specific functionality, read on.

## [How to configure peer dependencies?](?id=how-to-configure-peer-dependencies)

Any library built on top of Zod should include `"zod"` in `"peerDependencies"`. This lets your users "bring their own Zod".

```
// package.json
{
  // ...
  "peerDependencies": {
    "zod": "^3.25.0 || ^4.0.0" // the "zod/v4" subpath was added in 3.25.0
  }
}
```

During development, you need to meet your own peer dependency requirement, to do so, add `"zod"` to your `"devDependencies"` as well.

```
// package.json
{
  "peerDependencies": {
    "zod": "^3.25.0 || ^4.0.0"
  },
  "devDependencies": {
    // generally, you should develop against the latest version of Zod
    "zod": "^3.25.0 || ^4.0.0"
  }
}
```

## [How to support Zod 4?](?id=how-to-support-zod-4)

To support Zod 4, update the minimum version for your `"zod"` peer dependency to `^3.25.0 || ^4.0.0`.

```
// package.json
{
  // ...
  "peerDependencies": {
    "zod": "^3.25.0 || ^4.0.0"
  }
}
```

Starting with `v3.25.0`, the Zod 4 core package is available at the `"zod/v4/core"` subpath. Read the [Versioning in Zod 4](https://github.com/colinhacks/zod/issues/4371) writeup for full context on this versioning approach.

```
import * as z4 from "zod/v4/core";
```

Import from these subpaths only. Think of them like "permalinks" to their respective Zod versions. These will remain available forever.

* `"zod/v3"` for Zod 3 ✅
* `"zod/v4/core"` for the Zod 4 Core package ✅

You generally shouldn't be importing from any other paths. The Zod Core library is a shared library that undergirds both Zod 4 Classic and Zod 4 Mini. It's generally a bad idea to implement any functionality that is specific to one or the other. Do not import from these subpaths:

* `"zod"` — ❌ In 3.x releases, this exports Zod 3. In 4.x releases, this will export Zod 4. Use the permalinks instead.
* `"zod/v4"` and `"zod/v4/mini"`— ❌ These subpaths are the homes of Zod 4 Classic and Mini, respectively. If you want your library to work with both Zod and Zod Mini, you should build against the base classes defined in `"zod/v4/core"`. If you reference classes from the `"zod/v4"` module, your library will not work with Zod Mini, and vice versa. This is extremely discouraged. Use `"zod/v4/core"` instead, which exports the `$`-prefixed subclasses that are extended by Zod Classic and Zod Mini. The internals of the classic & mini subclasses are identical; they only differ in which helper methods they implement.

## [Do I need to publish a new major version?](?id=do-i-need-to-publish-a-new-major-version)

No, you should not need to publish a new major version of your library to support Zod 4 (unless you are dropping support for Zod 3, which isn't recommended).

You will need to bump your peer dependency to `^3.25.0`, thus your users will need to `npm upgrade zod`. But there were no breaking changes made to Zod 3 between `[email protected]` and `[email protected]`; in fact, there were no code changes whatsoever. As code changes will be required on the part of your users, I do not believe this constitutes a breaking change. I recommend against publishing a new major version.

## [How to support Zod 3 and Zod 4 simultaneously?](?id=how-to-support-zod-3-and-zod-4-simultaneously)

Starting in `v3.25.0`, the package contains copies of both Zod 3 and Zod 4 at their respective subpaths. This makes it easy to support both versions simultaneously.

```
import * as z3 from "zod/v3";
import * as z4 from "zod/v4/core";
 
type Schema = z3.ZodTypeAny | z4.$ZodType;
 
function acceptUserSchema(schema: z3.ZodTypeAny | z4.$ZodType) {
  // ...
}
```

To differentiate between Zod 3 and Zod 4 schemas at runtime, check for the `"_zod"` property. This property is only defined on Zod 4 schemas.

```
import type * as z3 from "zod/v3";
import type * as z4 from "zod/v4/core";
 
declare const schema: z3.ZodTypeAny | z4.$ZodType;
 
if ("_zod" in schema) {
  schema._zod.def; // Zod 4 schema
} else {
  schema._def; // Zod 3 schema
}
```

## [How to support Zod and Zod Mini simultaneously?](?id=how-to-support-zod-and-zod-mini-simultaneously)

Your library code should only import from `"zod/v4/core"`. This sub-package defines the interfaces, classes, and utilities that are shared between Zod and Zod Mini.

```
// library code
import * as z4 from "zod/v4/core";
 
export function acceptObjectSchema<T extends z4.$ZodObject>(schema: T){
  // parse data
  z4.parse(schema, { /* somedata */});
  // inspect internals
  schema._zod.def.shape;
}
```

By building against the shared base interfaces, you can reliably support both sub-packages simultaneously. This function can accept both Zod and Zod Mini schemas.

```
// user code
import { acceptObjectSchema } from "your-library";
 
// Zod 4
import * as z from "zod";
acceptObjectSchema(z.object({ name: z.string() }));
 
// Zod 4 Mini
import * as zm from "zod/mini";
acceptObjectSchema(zm.object({ name: zm.string() }))
```

Refer to the [Zod Core](/packages/core) page for more information on the contents of the core sub-library.

## [How to accept user-defined schemas?](?id=how-to-accept-user-defined-schemas)

Accepting user-defined schemas is the a fundamental operation for any library built on Zod. This section outlines the best practices for doing so.

When starting out, it may be tempting to write a function that accepts a Zod schema like this:

```
import * as z4 from "zod/v4/core";
 
function inferSchema<T>(schema: z4.$ZodType<T>) {
  return schema;
}
```

This approach is incorrect, and limits TypeScript's ability to properly infer the argument. No matter what you pass in, the type of `schema` will be an instance of `$ZodType`.

```
inferSchema(z.string());
// => $ZodType<string>
```

This approach loses type information, namely *which subclass* the input actually is (in this case, `ZodString`). That means you can't call any string-specific methods like `.min()` on the result of `inferSchema`. Instead, your generic parameter should extend the core Zod schema interface:

```
function inferSchema<T extends z4.$ZodType>(schema: T) {
  return schema;
}
 
inferSchema(z.string());
// => ZodString ✅
```

To constrain the input schema to a specific subclass:

```
import * as z4 from "zod/v4/core";
 
// only accepts object schemas
function inferSchema<T extends z4.$ZodObject>(schema: T) {
  return schema;
}
```

To constrain the inferred output type of the input schema:

```
import * as z4 from "zod/v4/core";
 
// only accepts string schemas
function inferSchema<T extends z4.$ZodType<string>>(schema: T) {
  return schema;
}
 
inferSchema(z.string()); // ✅ 
 
inferSchema(z.number()); 
// ❌ The types of '_zod.output' are incompatible between these types. 
// // Type 'number' is not assignable to type 'string'
```

To parse data with the schema, use the top-level `z4.parse`/`z4.safeParse`/`z4.parseAsync`/`z4.safeParseAsync` functions. The `z4.$ZodType` subclass has no methods on it. The usual parsing methods are implemented by Zod and Zod Mini, but are not available in Zod Core.

```
function parseData<T extends z4.$ZodType>(data: unknown, schema: T): z4.output<T> {
  return z.parse(schema, data);
}
 
parseData("sup", z.string());
// => string
```

[Ecosystem

Overview of the Zod ecosystem including integrations, tools, and community resources](/ecosystem)[Zod

Internals and structure of the Zod library](/packages/zod)

### On this page

[Do I need to depend on Zod?](#do-i-need-to-depend-on-zod)[How to configure peer dependencies?](#how-to-configure-peer-dependencies)[How to support Zod 4?](#how-to-support-zod-4)[Do I need to publish a new major version?](#do-i-need-to-publish-a-new-major-version)[How to support Zod 3 and Zod 4 simultaneously?](#how-to-support-zod-3-and-zod-4-simultaneously)[How to support Zod and Zod Mini simultaneously?](#how-to-support-zod-and-zod-mini-simultaneously)[How to accept user-defined schemas?](#how-to-accept-user-defined-schemas)