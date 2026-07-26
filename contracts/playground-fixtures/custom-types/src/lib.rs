#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, String, Symbol, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
/// Nested coordinates used by the profile fixture.
pub struct Coordinates {
    /// Latitude multiplied by one million.
    pub latitude: i64,
    /// Longitude multiplied by one million.
    pub longitude: i64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
/// Representative nested record for recursive form rendering.
pub struct Profile {
    /// Human-readable profile name.
    pub display_name: String,
    /// Nested coordinate record.
    pub home: Coordinates,
    /// Searchable symbolic labels.
    pub tags: Vec<Symbol>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
/// Unit enum used to exercise void union cases.
pub enum Status {
    /// The profile is available.
    Active,
    /// The profile is temporarily paused.
    Paused,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
/// Integer enum with stable external values.
pub enum Tier {
    /// Entry-level tier.
    Basic = 1,
    /// Professional tier.
    Pro = 2,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
/// Tuple union covering void, scalar, custom, and multi-value cases.
pub enum Payload {
    /// No payload.
    Empty,
    /// A single count.
    Count(u64),
    /// A nested custom record.
    Profile(Profile),
    /// A heterogeneous tuple payload.
    Pair(i32, Symbol),
}

/// User-defined struct, enum, integer-enum, and union fixture.
#[contract]
pub struct CustomTypesFixture;

#[contractimpl]
impl CustomTypesFixture {
    pub fn echo_profile(value: Profile) -> Profile {
        value
    }

    pub fn echo_status(value: Status) -> Status {
        value
    }

    pub fn echo_tier(value: Tier) -> Tier {
        value
    }

    pub fn echo_payload(value: Payload) -> Payload {
        value
    }
}
