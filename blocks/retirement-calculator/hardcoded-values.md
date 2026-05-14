# Hardcoded Values in retirement-calculator.js

## API Payload Constants

| Value | Location | Description |
|-------|----------|-------------|
| `'1.5'` | Journey 1 & Journey 2 payload | `inflationrate` |
| `'3'` | Journey 1 & Journey 2 payload | `afterretirerate` |
| `0.03` | Journey 1 payload | Default `CompensationRate` (3%) |
| `0.05` | Journey 2 `payload5` | Alt scenario `CompensationRate` (5%) |

## Default Field Values

| Value | Field | Description |
|-------|-------|-------------|
| `20000` | Monthly income | Default value for income card |
| `30` | `currentAge` | Default current age |
| `60` | `retirementAge` | Default retirement age |
| `80` | `lifeExpectancy` | Default life expectancy |
| `3` | `CompensationRatePct` | Default savings return rate (%) |
| `0` | All other J2 percent fields | Default rate for PVD, RMF, salary increase, etc. |

## Validation Limits

| Value | Field | Description |
|-------|-------|-------------|
| `1` | Monthly income | Min value |
| `999999999` | Monthly income, all money fields | Max value |
| `120` | All age fields | Max age |
| `0–100` | All percent fields | Min–max range |

