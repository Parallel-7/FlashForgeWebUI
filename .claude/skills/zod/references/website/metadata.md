Metadata and registries | Zod

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

# Metadata and registries

Copy markdown

[Edit this page](https://github.com/colinhacks/zod/edit/main/packages/docs/content/metadata.mdx)

It's often useful to associate a schema with some additional *metadata* for documentation, code generation, AI structured outputs, form validation, and other purposes.

## [Registries](?id=registries)

Metadata in Zod is handled via *registries*. Registries are collections of schemas, each associated with some *strongly-typed* metadata. To create a simple registry:

```
import * as z from "zod";
 
const myRegistry = z.registry<{ description: string }>();
```

To register, lookup, and remove schemas from this registry:

```
const mySchema = z.string();
 
myRegistry.add(mySchema, { description: "A cool schema!"});
myRegistry.has(mySchema); // => true
myRegistry.get(mySchema); // => { description: "A cool schema!" }
myRegistry.remove(mySchema);
myRegistry.clear(); // wipe registry
```

TypeScript enforces that the metadata for each schema matches the registry's **metadata type**.

```
myRegistry.add(mySchema, { description: "A cool schema!" }); // ✅
myRegistry.add(mySchema, { description: 123 }); // ❌
```

**Special handling for `id`** — Zod registries treat the `id` property specially. An `Error` will be thrown if multiple schemas are registered with the same `id` value. This is true for all registries, including the global registry.

### [`.register()`](?id=register)

**Note** — This method is special in that it does not return a new schema; instead, it returns the original schema. No other Zod method does this! That includes `.meta()` and `.describe()` (documented below) which return a new instance.

Schemas provide a `.register()` method to more conveniently add it to a registry.

```
const mySchema = z.string();
 
mySchema.register(myRegistry, { description: "A cool schema!" });
// => mySchema
```

This lets you define metadata "inline" in your schemas.

```
const mySchema = z.object({
  name: z.string().register(myRegistry, { description: "The user's name" }),
  age: z.number().register(myRegistry, { description: "The user's age" }),
})
```

If a registry is defined without a metadata type, you can use it as a generic "collection", no metadata required.

```
const myRegistry = z.registry();
 
myRegistry.add(z.string());
myRegistry.add(z.number());
```

## [Metadata](?id=metadata)

### [`z.globalRegistry`](?id=zglobalregistry)

For convenience, Zod provides a global registry (`z.globalRegistry`) that can be used to store metadata for JSON Schema generation or other purposes. It accepts the following metadata:

```
export interface GlobalMeta {
  id?: string ;
  title?: string ;
  description?: string;
  deprecated?: boolean;
  [k: string]: unknown;
}
```

To register some metadata in `z.globalRegistry` for a schema:

```
import * as z from "zod";
 
const emailSchema = z.email().register(z.globalRegistry, { 
  id: "email_address",
  title: "Email address",
  description: "Your email address",
  examples: ["[email protected]"]
});
```

To globally augment the `GlobalMeta` interface, use [*declaration merging*](https://www.typescriptlang.org/docs/handbook/declaration-merging.html). Add the following anywhere in your codebase. Creating a `zod.d.ts` file in your project root is a common convention.

```
declare module "zod" {
  interface GlobalMeta {
    // add new fields here
    examples?: unknown[];
  }
}
 
// forces TypeScript to consider the file a module
export {}
```

### [`.meta()`](?id=meta)

For a more convenient approach, use the `.meta()` method to register a schema in `z.globalRegistry`.

ZodZod Mini

```
const emailSchema = z.email().meta({ 
  id: "email_address",
  title: "Email address",
  description: "Please enter a valid email address",
});
```

Calling `.meta()` without an argument will *retrieve* the metadata for a schema.

```
emailSchema.meta();
// => { id: "email_address", title: "Email address", ... }
```

Metadata is associated with a *specific schema instance.* This is important to keep in mind, especially since Zod methods are immutable—they always return a new instance.

```
const A = z.string().meta({ description: "A cool string" });
A.meta(); // => { description: "A cool string" }
 
const B = A.refine(_ => true);
B.meta(); // => undefined
```

### [`.describe()`](?id=describe)

The `.describe()` method still exists for compatibility with Zod 3, but `.meta()` is now the recommended approach.

The `.describe()` method is a shorthand for registering a schema in `z.globalRegistry` with just a `description` field.

ZodZod Mini

```
const emailSchema = z.email();
emailSchema.describe("An email address");
 
// equivalent to
emailSchema.meta({ description: "An email address" });
```

## [Custom registries](?id=custom-registries)

You've already seen a simple example of a custom registry:

```
import * as z from "zod";
 
const myRegistry = z.registry<{ description: string };>();
```

Let's look at some more advanced patterns.

### [Referencing inferred types](?id=referencing-inferred-types)

It's often valuable for the metadata type to reference the *inferred type* of a schema. For instance, you may want an `examples` field to contain examples of the schema's output.

```
import * as z from "zod";
 
type MyMeta = { examples: z.$output[] };
const myRegistry = z.registry<MyMeta>();
 
myRegistry.add(z.string(), { examples: ["hello", "world"] });
myRegistry.add(z.number(), { examples: [1, 2, 3] });
```

The special symbol `z.$output` is a reference to the schemas inferred output type (`z.infer<typeof schema>`). Similarly you can use `z.$input` to reference the input type.

### [Constraining schema types](?id=constraining-schema-types)

Pass a second generic to `z.registry()` to constrain the schema types that can be added to a registry. This registry only accepts string schemas.

```
import * as z from "zod";
 
const myRegistry = z.registry<{ description: string }, z.ZodString>();
 
myRegistry.add(z.string(), { description: "A number" }); // ✅
myRegistry.add(z.number(), { description: "A number" }); // ❌ 
//             ^ 'ZodNumber' is not assignable to parameter of type 'ZodString'
```

[Formatting errors

Utilities for formatting and displaying Zod errors](/error-formatting)[JSON Schema

How to convert Zod schemas to JSON Schema](/json-schema)

### On this page

[Registries](#registries)[`.register()`](#register)[Metadata](#metadata)[`z.globalRegistry`](#zglobalregistry)[`.meta()`](#meta)[`.describe()`](#describe)[Custom registries](#custom-registries)[Referencing inferred types](#referencing-inferred-types)[Constraining schema types](#constraining-schema-types)