use soroban_sdk::{symbol_short, vec, Env, String};
use velo_playground_custom_types::{
    Coordinates, CustomTypesFixture, CustomTypesFixtureClient, Payload, Profile, Status, Tier,
};

#[test]
fn nested_struct_round_trips() {
    let env = Env::default();
    let contract_id = env.register(CustomTypesFixture, ());
    let client = CustomTypesFixtureClient::new(&env, &contract_id);
    let profile = Profile {
        display_name: String::from_str(&env, "Velo"),
        home: Coordinates {
            latitude: 14_599_500,
            longitude: 120_984_200,
        },
        tags: vec![&env, symbol_short!("stellar"), symbol_short!("soroban")],
    };

    assert_eq!(client.echo_profile(&profile), profile);
}

#[test]
fn enum_integer_enum_and_union_cases_round_trip() {
    let env = Env::default();
    let contract_id = env.register(CustomTypesFixture, ());
    let client = CustomTypesFixtureClient::new(&env, &contract_id);

    assert_eq!(client.echo_status(&Status::Active), Status::Active);
    assert_eq!(client.echo_tier(&Tier::Pro), Tier::Pro);
    assert_eq!(client.echo_payload(&Payload::Empty), Payload::Empty);
    assert_eq!(
        client.echo_payload(&Payload::Pair(-7, symbol_short!("Velo"))),
        Payload::Pair(-7, symbol_short!("Velo"))
    );
}
