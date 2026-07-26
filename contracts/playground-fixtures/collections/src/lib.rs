#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, Bytes, BytesN, Error, Map, String, Symbol, Val, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum CollectionError {
    RequestedFailure = 1,
}

/// Collection and recursive-container type-matrix fixture.
#[contract]
pub struct CollectionsFixture;

#[contractimpl]
impl CollectionsFixture {
    pub fn accept_value(_value: Val) -> bool {
        true
    }

    pub fn accept_error(_value: Error) -> bool {
        true
    }

    pub fn echo_bool(value: bool) -> bool {
        value
    }

    pub fn echo_string(value: String) -> String {
        value
    }

    pub fn echo_bytes(value: Bytes) -> Bytes {
        value
    }

    pub fn echo_fixed(value: BytesN<32>) -> BytesN<32> {
        value
    }

    pub fn echo_vec(value: Vec<u32>) -> Vec<u32> {
        value
    }

    pub fn echo_map(value: Map<Symbol, i128>) -> Map<Symbol, i128> {
        value
    }

    pub fn echo_tuple(value: (i32, Symbol)) -> (i32, Symbol) {
        value
    }

    pub fn echo_option(value: Option<u32>) -> Option<u32> {
        value
    }

    pub fn echo_result(value: u32, fail: bool) -> Result<u32, CollectionError> {
        if fail {
            Err(CollectionError::RequestedFailure)
        } else {
            Ok(value)
        }
    }
}
