# Third-Party License Notes

This project should stay compatible with commercial distribution by using permissive
open-source libraries only.

## Direct Runtime Dependencies

| Package | Version | License | Notes |
| --- | --- | --- | --- |
| Next.js | 14.2.35 | MIT | Commercial use, modification, distribution allowed with license notice. |
| React | 18.3.1 | MIT | Commercial use, modification, distribution allowed with license notice. |
| React DOM | 18.3.1 | MIT | Commercial use, modification, distribution allowed with license notice. |

## Observed Transitive Licenses

The installed dependency tree is primarily MIT, ISC, BSD-3-Clause, and 0BSD.
These are permissive licenses suitable for proprietary or commercial products
when their notice requirements are preserved.

One notable transitive data package is `caniuse-lite`, licensed under CC-BY-4.0.
CC-BY-4.0 allows commercial use, but attribution should be retained in any
third-party notices bundle distributed with the product.

## Policy For New Dependencies

Before adding a package, prefer licenses in this allowlist:

- MIT
- Apache-2.0
- BSD-2-Clause
- BSD-3-Clause
- ISC
- 0BSD

Avoid adding dependencies under copyleft or source-available licenses unless the
business decision is explicit and reviewed first, especially:

- GPL
- AGPL
- LGPL
- SSPL
- BUSL
- Commons Clause

Provider API terms are separate from package licenses. Selling or sharing this
app may also require checking the terms for OpenAI, Anthropic, Google, xAI,
Perplexity, or any other connected AI provider.
