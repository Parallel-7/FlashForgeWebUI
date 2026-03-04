Intro | Zod

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

![Zod logo](/_next/image?url=%2Flogo%2Flogo-glow.png&w=640&q=100)![Zod logo](/_next/image?url=%2Flogo%2Flogo-glow.png&w=640&q=100)

# Zod

TypeScript-first schema validation with static type inference  
by [@colinhacks](https://x.com/colinhacks)

  

[![Zod CI status](https://github.com/colinhacks/zod/actions/workflows/test.yml/badge.svg?event=push&branch=main)](https://github.com/colinhacks/zod/actions?query=branch%3Amain)[![Created by Colin McDonnell](https://img.shields.io/badge/created%20by-@colinhacks-4BBAAB.svg)](https://twitter.com/colinhacks)[![License](https://img.shields.io/github/license/colinhacks/zod)](https://opensource.org/licenses/MIT)[![npm](https://img.shields.io/npm/dw/zod.svg)](https://www.npmjs.com/package/zod)[![stars](https://img.shields.io/github/stars/colinhacks/zod)](https://github.com/colinhacks/zod)

[Website](https://zod.dev)  •  [Discord](https://discord.gg/RcG33DQJdf)  •  [𝕏](https://twitter.com/colinhacks)  •  [Bluesky](https://bsky.app/profile/zod.dev)

  


Zod 4 is now stable! Read the [release notes here](/v4).

  
  
  

## Featured sponsor: Jazz

[![Jazz logo](https://raw.githubusercontent.com/garden-co/jazz/938f6767e46cdfded60e50d99bf3b533f4809c68/homepage/homepage/public/Zod%20sponsor%20message.png)](https://jazz.tools/?utm_source=zod)

Interested in featuring? [Get in touch.](/cdn-cgi/l/email-protection#493a3926273a263b3a212039092a2625202721282a223a672a2624)

## [Introduction](?id=introduction)

Zod is a TypeScript-first validation library. Using Zod, you can define *schemas* you can use to validate data, from a simple `string` to a complex nested object.

```
import * as z from "zod";
 
const User = z.object({
  name: z.string(),
});
 
// some untrusted data...
const input = { /* stuff */ };
 
// the parsed result is validated and type safe!
const data = User.parse(input);
 
// so you can use it with confidence :)
console.log(data.name);
```

## [Features](?id=features)

* Zero external dependencies
* Works in Node.js and all modern browsers
* Tiny: 2kb core bundle (gzipped)
* Immutable API: methods return a new instance
* Concise interface
* Works with TypeScript and plain JS
* Built-in JSON Schema conversion
* Extensive ecosystem

## [Installation](?id=installation)

```
npm install zod
```

Zod is also available as `@zod/zod` on [jsr.io](https://jsr.io/@zod/zod).

Zod provides an MCP server that can be used by agents to search Zod's docs. To add to your editor, follow [these instructions](https://share.inkeep.com/zod/mcp). Zod also provides an [llms.txt](https://zod.dev/llms.txt) file.

## [Requirements](?id=requirements)

Zod is tested against *TypeScript v5.5* and later. Older versions may work but are not officially supported.

### [`"strict"`](?id=strict)

You must enable `strict` mode in your `tsconfig.json`. This is a best practice for all TypeScript projects.

```
// tsconfig.json
{
  // ...
  "compilerOptions": {
    // ...
    "strict": true
  }
}
```

## [Ecosystem](?id=ecosystem)

Zod has a thriving ecosystem of libraries, tools, and integrations. Refer to the [Ecosystem page](/ecosystem) for a complete list of libraries that support Zod or are built on top of it.

* [Resources](/ecosystem?id=resources)
* [API Libraries](/ecosystem?id=api-libraries)
* [Form Integrations](/ecosystem?id=form-integrations)
* [Zod to X](/ecosystem?id=zod-to-x)
* [X to Zod](/ecosystem?id=x-to-zod)
* [Mocking Libraries](/ecosystem?id=mocking-libraries)
* [Powered by Zod](/ecosystem?id=powered-by-zod)

I also contribute to the following projects, which I'd like to highlight:

* [tRPC](https://trpc.io) - End-to-end typesafe APIs, with support for Zod schemas
* [React Hook Form](https://react-hook-form.com) - Hook-based form validation with a [Zod resolver](https://react-hook-form.com/docs/useform#resolver)
* [zshy](https://github.com/colinhacks/zshy) - Originally created as Zod's internal build tool. Bundler-free, batteries-included build tool for TypeScript libraries. Powered by `tsc`.

## [Sponsors](?id=sponsors)

Sponsorship at any level is appreciated and encouraged. If you built a paid product using Zod, consider one of the [corporate tiers](https://github.com/sponsors/colinhacks).

### [Platinum](?id=platinum)

[![CodeRabbit logo (dark theme)](https://github.com/user-attachments/assets/eea24edb-ff20-4532-b57c-e8719f455d6d)![CodeRabbit logo (light theme)](https://github.com/user-attachments/assets/d791bc7d-dc60-4d55-9c31-97779839cb74)](https://www.coderabbit.ai/)

Cut code review time & bugs in half

[coderabbit.ai](https://www.coderabbit.ai/)

  

### [Gold](?id=gold)

[![Brand.dev logo (light theme)](https://avatars.githubusercontent.com/brand-dot-dev)![Brand.dev logo (dark theme)](https://avatars.githubusercontent.com/brand-dot-dev)](https://brand.dev/?utm_source=zod)

API for logos, colors, and company info

[brand.dev](https://brand.dev/?utm_source=zod)

[![Courier logo (light theme)](https://github.com/user-attachments/assets/6b09506a-78de-47e8-a8c1-792efe31910a)![Courier logo (dark theme)](https://github.com/user-attachments/assets/6b09506a-78de-47e8-a8c1-792efe31910a)](https://www.courier.com/?utm_source=zod&utm_campaign=osssponsors)

The API platform for sending notifications

[courier.com](https://www.courier.com/?utm_source=zod&utm_campaign=osssponsors)

[![Liblab logo (light theme)](https://github.com/user-attachments/assets/3de0b617-5137-49c4-b72d-a033cbe602d8)![Liblab logo (dark theme)](https://github.com/user-attachments/assets/34dfa1a2-ce94-46f4-8902-fbfac3e1a9bc)](https://liblab.com/?utm_source=zod)

Generate better SDKs for your APIs

[liblab.com](https://liblab.com/?utm_source=zod)

[![Neon logo (light theme)](https://github.com/user-attachments/assets/b5799fc8-81ff-4053-a1c3-b29adf85e7a1)![Neon logo (dark theme)](https://github.com/user-attachments/assets/83b4b1b1-a9ab-4ae5-a632-56d282f0c444)](https://neon.tech)

Serverless Postgres — Ship faster

[neon.tech](https://neon.tech)

[![Retool logo (light theme)](https://github.com/colinhacks/zod/assets/3084745/5ef4c11b-efeb-4495-90a8-41b83f798600)![Retool logo (dark theme)](https://github.com/colinhacks/zod/assets/3084745/ac65013f-aeb4-48dd-a2ee-41040b69cbe6)](https://retool.com/?utm_source=github&utm_medium=referral&utm_campaign=zod)

Build AI apps and workflows with Retool AI

[retool.com](https://retool.com/?utm_source=github&utm_medium=referral&utm_campaign=zod)

[![Stainless logo (light theme)](https://github.com/colinhacks/zod/assets/3084745/e9444e44-d991-4bba-a697-dbcfad608e47)![Stainless logo (dark theme)](https://github.com/colinhacks/zod/assets/3084745/f20759c1-3e51-49d0-a31e-bbc43abec665)](https://stainlessapi.com)

Generate best-in-class SDKs

[stainlessapi.com](https://stainlessapi.com)

[![Speakeasy logo (light theme)](https://r2.zod.dev/Logo_Black.svg)![Speakeasy logo (dark theme)](https://r2.zod.dev/Logo_White.svg)](https://speakeasy.com/?utm_source=zod+docs)

SDKs & Terraform providers for your API

[speakeasy.com](https://speakeasy.com/?utm_source=zod+docs)

  

### [Silver](?id=silver)

[![Subtotal logo](https://avatars.githubusercontent.com/u/176449348?s=200&v=4)subtotal.com](https://www.subtotal.com/?utm_source=zod)

[![Nitric logo](https://avatars.githubusercontent.com/u/72055470?s=200&v=4)nitric.io](https://nitric.io/)

[![PropelAuth logo](https://avatars.githubusercontent.com/u/89474619?s=200&v=4)propelauth.com](https://www.propelauth.com/)

[![Cerbos logo](https://avatars.githubusercontent.com/u/80861386?s=200&v=4)cerbos.dev](https://cerbos.dev/)

[![Scalar logo](https://avatars.githubusercontent.com/u/301879?s=200&v=4)scalar.com](https://scalar.com/)

[![Trigger.dev logo](https://avatars.githubusercontent.com/u/95297378?s=200&v=4)trigger.dev](https://trigger.dev)

[![Transloadit logo](https://avatars.githubusercontent.com/u/125754?s=200&v=4)transloadit.com](https://transloadit.com/?utm_source=zod&utm_medium=referral&utm_campaign=sponsorship&utm_content=github)

[![Infisical logo](https://avatars.githubusercontent.com/u/107880645?s=200&v=4)infisical.com](https://infisical.com)

[![Whop logo](https://avatars.githubusercontent.com/u/91036480?s=200&v=4)whop.com](https://whop.com/)

[![CryptoJobsList logo](https://avatars.githubusercontent.com/u/36402888?s=200&v=4)cryptojobslist.com](https://cryptojobslist.com/)

[![Plain logo](https://avatars.githubusercontent.com/u/70170949?s=200&v=4)plain.com](https://plain.com/)

[![Inngest logo](https://avatars.githubusercontent.com/u/78935958?s=200&v=4)inngest.com](https://inngest.com/)

[![Storyblok logo](https://avatars.githubusercontent.com/u/13880908?s=200&v=4)storyblok.com](https://storyblok.com/)

[![Mux logo](https://avatars.githubusercontent.com/u/16199997?s=200&v=4)mux.link/zod](https://mux.link/zod)

  

### [Bronze](?id=bronze)

[![Val Town logo](https://github.com/user-attachments/assets/95305fc4-4da6-4bf8-aea4-bae8f5893e5d)](https://www.val.town/)[val.town](https://www.val.town/)

[![Route4Me logo](https://avatars.githubusercontent.com/u/7936820?s=200&v=4)](https://www.route4me.com/)[route4me.com](https://www.route4me.com/)

[![Encore logo](https://github.com/colinhacks/zod/assets/3084745/5ad94e73-cd34-4957-9979-37da85fcf9cd)](https://encore.dev)[encore.dev](https://encore.dev)

[![Replay logo](https://avatars.githubusercontent.com/u/60818315?s=200&v=4)](https://www.replay.io/)[replay.io](https://www.replay.io/)

[![Numeric logo](https://i.imgur.com/kTiLtZt.png)](https://www.numeric.io)[numeric.io](https://www.numeric.io)

[![Marcato Partners logo](https://avatars.githubusercontent.com/u/84106192?s=200&v=4)](https://marcatopartners.com)[marcatopartners.com](https://marcatopartners.com)

[![Interval logo](https://avatars.githubusercontent.com/u/67802063?s=200&v=4)](https://interval.com)[interval.com](https://interval.com)

[![Seasoned logo](https://avatars.githubusercontent.com/u/33913103?s=200&v=4)](https://seasoned.cc)[seasoned.cc](https://seasoned.cc)

[![Bamboo Creative logo](https://avatars.githubusercontent.com/u/41406870?v=4)](https://www.bamboocreative.nz/)[bamboocreative.nz](https://www.bamboocreative.nz/)

[![Jason Laster logo](https://avatars.githubusercontent.com/u/254562?v=4)](https://github.com/jasonLaster)[github.com/jasonLaster](https://github.com/jasonLaster)

[![Clipboard logo](https://avatars.githubusercontent.com/u/28880063?s=200&v=4)](https://www.clipboardhealth.com/engineering)[clipboardhealth.com/engineering](https://www.clipboardhealth.com/engineering)

### On this page

[Introduction](#introduction)[Features](#features)[Installation](#installation)[Requirements](#requirements)[`"strict"`](#strict)[Ecosystem](#ecosystem)[Sponsors](#sponsors)[Platinum](#platinum)[Gold](#gold)[Silver](#silver)[Bronze](#bronze)