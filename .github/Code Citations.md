# Code Citations

## License: MIT
https://github.com/validator/validator/tree/8c69d1ae9383015f83771be6955883f6b16c7745/.github/workflows/codeql-analysis.yml

```
"

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]
  schedule:
    - cron: '0 0 * * 0'

jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    permissions:
      actions: read
      contents: read
      security-events:
```

