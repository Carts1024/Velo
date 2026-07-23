#![no_std]

use soroban_sdk::{contract, contractimpl, Duration, Timepoint, I256, U256};

/// Numeric type-matrix fixture. Every function is intentionally an identity
/// operation so clients can prove lossless encoding and decoding.
#[contract]
pub struct NumericFixture;

#[contractimpl]
impl NumericFixture {
    pub fn echo_i32(value: i32) -> i32 {
        value
    }

    pub fn echo_i64(value: i64) -> i64 {
        value
    }

    pub fn echo_i128(value: i128) -> i128 {
        value
    }

    pub fn echo_i256(value: I256) -> I256 {
        value
    }

    pub fn echo_u32(value: u32) -> u32 {
        value
    }

    pub fn echo_u64(value: u64) -> u64 {
        value
    }

    pub fn echo_u128(value: u128) -> u128 {
        value
    }

    pub fn echo_u256(value: U256) -> U256 {
        value
    }

    pub fn echo_time(value: Timepoint) -> Timepoint {
        value
    }

    pub fn echo_dur(value: Duration) -> Duration {
        value
    }
}
