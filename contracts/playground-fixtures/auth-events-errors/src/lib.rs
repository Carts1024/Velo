#![no_std]

use soroban_sdk::{contract, contracterror, contractevent, contractimpl, Address, Env};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
/// Stable failures surfaced by the auth/event fixture.
pub enum AuthFixtureError {
    /// Amounts must be non-zero.
    InvalidAmount = 1,
    /// Explicit failure used to exercise decoding.
    DeliberateFailure = 2,
}

#[contractevent(topics = ["authorized"])]
/// Published after the actor authorizes a non-zero amount.
pub struct ActionAuthorized {
    /// Address that authorized the invocation.
    #[topic]
    pub actor: Address,
    /// Authorized fixture amount.
    pub amount: u32,
}

/// Authorization, diagnostic error, and contract-event fixture.
#[contract]
pub struct AuthEventsErrorsFixture;

#[contractimpl]
impl AuthEventsErrorsFixture {
    pub fn authorize(env: Env, actor: Address, amount: u32) -> Result<u32, AuthFixtureError> {
        if amount == 0 {
            return Err(AuthFixtureError::InvalidAmount);
        }

        actor.require_auth();
        ActionAuthorized { actor, amount }.publish(&env);

        Ok(amount)
    }

    pub fn always_fail() -> Result<(), AuthFixtureError> {
        Err(AuthFixtureError::DeliberateFailure)
    }
}
