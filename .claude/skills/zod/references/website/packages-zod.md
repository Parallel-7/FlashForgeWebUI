Zod | Zod

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

# Zod

Copy markdown

[Edit this page](https://github.com/colinhacks/zod/edit/main/packages/docs/content/packages/zod.mdx)

The `zod/v4` package is the "flagship" library of the Zod ecosystem. It strikes a balance between developer experience and bundle size that's ideal for the vast majority of applications.

If you have uncommonly strict constraints around bundle size, consider [Zod Mini](/packages/mini).

Zod aims to provide a schema API that maps one-to-one to TypeScript's type system.

```
import * as z from "zod";
 
const schema = z.object({
  name: z.string(),
  age: z.number().int().positive(),
  email: z.email(),
});
```

The API relies on methods to provide a concise, chainable, autocomplete-friendly way to define complex types.

```
z.string()
  .min(5)
  .max(10)
  .toLowerCase();
```

All schemas extend the `z.ZodType` base class, which in turn extends `z.$ZodType` from [`zod/v4/core`](/packages/core). All instance of `ZodType` implement the following methods:

```
import * as z from "zod";
 
const mySchema = z.string();
 
// parsing
mySchema.parse(data);
mySchema.safeParse(data);
mySchema.parseAsync(data);
mySchema.safeParseAsync(data);
 
 
// refinements
mySchema.refine(refinementFunc);
mySchema.superRefine(refinementFunc); // deprecated, use `.check()`
mySchema.overwrite(overwriteFunc);
 
// wrappers
mySchema.optional();
mySchema.nonoptional();
mySchema.nullable();
mySchema.nullish();
mySchema.default(defaultValue);
mySchema.array();
mySchema.or(otherSchema);
mySchema.transform(transformFunc);
mySchema.catch(catchValue);
mySchema.pipe(otherSchema);
mySchema.readonly();
 
// metadata and registries
mySchema.register(registry, metadata);
mySchema.describe(description);
mySchema.meta(metadata);
 
// utilities
mySchema.check(checkOrFunction);
mySchema.clone(def);
mySchema.brand<T>();
mySchema.isOptional(); // boolean
mySchema.isNullable(); // boolean
```

[For library authors

Guidelines and best practices for library authors integrating with Zod](/library-authors)[Zod Mini

Zod Mini - a tree-shakable Zod](/packages/mini)