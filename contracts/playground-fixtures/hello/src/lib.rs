#![no_std]

use soroban_sdk::{contract, contractimpl, symbol_short, vec, Env, Symbol, Vec};

/// Small allowlisted fixture used by the Sprint 1 browser invocation flow.
#[contract]
pub struct HelloFixture;

#[contractimpl]
impl HelloFixture {
    /// Return a deterministic greeting for the supplied Soroban symbol.
    pub fn hello(env: Env, to: Symbol) -> Vec<Symbol> {
        vec![&env, symbol_short!("Hello"), to]
    }
}
