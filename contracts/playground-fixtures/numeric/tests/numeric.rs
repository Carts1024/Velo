use soroban_sdk::{Duration, Env, Timepoint, I256, U256};
use velo_playground_numeric::{NumericFixture, NumericFixtureClient};

#[test]
fn signed_and_unsigned_widths_round_trip() {
    let env = Env::default();
    let contract_id = env.register(NumericFixture, ());
    let client = NumericFixtureClient::new(&env, &contract_id);

    assert_eq!(client.echo_i32(&i32::MIN), i32::MIN);
    assert_eq!(client.echo_i64(&i64::MIN), i64::MIN);
    assert_eq!(client.echo_i128(&i128::MIN), i128::MIN);
    assert_eq!(client.echo_u32(&u32::MAX), u32::MAX);
    assert_eq!(client.echo_u64(&u64::MAX), u64::MAX);
    assert_eq!(client.echo_u128(&u128::MAX), u128::MAX);

    let i256 = I256::from_parts(&env, i64::MIN, u64::MAX, 7, 9);
    let u256 = U256::from_parts(&env, u64::MAX, u64::MAX, 7, 9);
    assert_eq!(client.echo_i256(&i256), i256);
    assert_eq!(client.echo_u256(&u256), u256);
}

#[test]
fn timepoint_and_duration_round_trip() {
    let env = Env::default();
    let contract_id = env.register(NumericFixture, ());
    let client = NumericFixtureClient::new(&env, &contract_id);
    let timepoint = Timepoint::from_unix(&env, 1_725_000_000);
    let duration = Duration::from_seconds(&env, 86_400);

    assert_eq!(client.echo_time(&timepoint), timepoint);
    assert_eq!(client.echo_dur(&duration), duration);
}
