Formatting errors | Zod

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

# Formatting errors

Copy markdown

[Edit this page](https://github.com/colinhacks/zod/edit/main/packages/docs/content/error-formatting.mdx)

Zod emphasizes *completeness* and *correctness* in its error reporting. In many cases, it's helpful to convert the `$ZodError` to a more useful format. Zod provides some utilities for this.

Consider this simple object schema.

```
import * as z from "zod";
 
const schema = z.strictObject({
  username: z.string(),
  favoriteNumbers: z.array(z.number()),
});
```

Attempting to parse this invalid data results in an error containing three issues.

```
const result = schema.safeParse({
  username: 1234,
  favoriteNumbers: [1234, "4567"],
  extraKey: 1234,
});
 
result.error!.issues;
[
  {
    expected: 'string',
    code: 'invalid_type',
    path: [ 'username' ],
    message: 'Invalid input: expected string, received number'
  },
  {
    expected: 'number',
    code: 'invalid_type',
    path: [ 'favoriteNumbers', 1 ],
    message: 'Invalid input: expected number, received string'
  },
  {
    code: 'unrecognized_keys',
    keys: [ 'extraKey' ],
    path: [],
    message: 'Unrecognized key: "extraKey"'
  }
];
```

## [`z.treeifyError()`](?id=ztreeifyerror)

To convert ("treeify") this error into a nested object, use `z.treeifyError()`.

```
const tree = z.treeifyError(result.error);
 
// =>
{
  errors: [ 'Unrecognized key: "extraKey"' ],
  properties: {
    username: { errors: [ 'Invalid input: expected string, received number' ] },
    favoriteNumbers: {
      errors: [],
      items: [
        undefined,
        {
          errors: [ 'Invalid input: expected number, received string' ]
        }
      ]
    }
  }
}
```

The result is a nested structure that mirrors the schema itself. You can easily access the errors that occurred at a particular path. The `errors` field contains the error messages at a given path, and the special properties `properties` and `items` let you traverse deeper into the tree.

```
tree.properties?.username?.errors;
// => ["Invalid input: expected string, received number"]
 
tree.properties?.favoriteNumbers?.items?.[1]?.errors;
// => ["Invalid input: expected number, received string"];
```

Be sure to use optional chaining (`?.`) to avoid errors when accessing nested properties.

## [`z.prettifyError()`](?id=zprettifyerror)

The `z.prettifyError()` provides a human-readable string representation of the error.

```
const pretty = z.prettifyError(result.error);
```

This returns the following string:

```
✖ Unrecognized key: "extraKey"
✖ Invalid input: expected string, received number
  → at username
✖ Invalid input: expected number, received string
  → at favoriteNumbers[1]
```

## [`z.formatError()`](?id=zformaterror)

This has been deprecated in favor of `z.treeifyError()`.

### Show docs

## [`z.flattenError()`](?id=zflattenerror)

While `z.treeifyError()` is useful for traversing a potentially complex nested structure, the majority of schemas are *flat*—just one level deep. In this case, use `z.flattenError()` to retrieve a clean, shallow error object.

```
const flattened = z.flattenError(result.error);
// { errors: string[], properties: { [key: string]: string[] } }
 
{
  formErrors: [ 'Unrecognized key: "extraKey"' ],
  fieldErrors: {
    username: [ 'Invalid input: expected string, received number' ],
    favoriteNumbers: [ 'Invalid input: expected number, received string' ]
  }
}
```

The `formErrors` array contains any top-level errors (where `path` is `[]`). The `fieldErrors` object provides an array of errors for each field in the schema.

```
flattened.fieldErrors.username; // => [ 'Invalid input: expected string, received number' ]
flattened.fieldErrors.favoriteNumbers; // => [ 'Invalid input: expected number, received string' ]
```

[Customizing errors

Guide to customizing validation error messages and error handling patterns](/error-customization)[Metadata and registries

Attaching and manipulatinvg metadata on Zod schemas](/metadata)

### On this page

[`z.treeifyError()`](#ztreeifyerror)[`z.prettifyError()`](#zprettifyerror)[`z.formatError()`](#zformaterror)[`z.flattenError()`](#zflattenerror)