#include <Arduino.h>
#include <SPI.h>
#include <RF24.h>
#include <ArduinoJson.h>

#define CE_PIN 2
#define CSN_PIN 25

SPIClass hspi(HSPI);
RF24 radio(CE_PIN, CSN_PIN); // Create RF24 object

#define LED 23

#define S1 26
#define H1 34
#define V1 35

#define S2 27
#define H2 32
#define V2 33

const byte address[6] = "NODE1";

void setup()
{
  pinMode(S1, INPUT);
  pinMode(H1, INPUT);
  pinMode(V1, INPUT);
  pinMode(S2, INPUT);
  pinMode(H2, INPUT);
  pinMode(V2, INPUT);

  hspi.begin(14, 12, 13, CSN_PIN); // SCLK, MISO, MOSI, SS

  Serial.begin(9600);
  delay(1000);

  // Set SPI interface used by RF24
  radio.begin(&hspi);

  if (!radio.isChipConnected())
  {
    Serial.println("nRF24L01 not detected!");
    while (1)
      ;
  }

  Serial.println("nRF24L01 transmitter ready.");

  pinMode(LED, OUTPUT);
  digitalWrite(LED, HIGH);
}

void loop()
{

  JsonDocument doc;

  doc["S1"] = digitalRead(S1);
  doc["H1"] = (analogRead(H1) - 2048) / 20;
  doc["V1"] = (analogRead(V1) - 2048) / 20;
  doc["S2"] = digitalRead(S2);
  doc["H2"] = (analogRead(H2) - 2048) / 20;
  doc["V2"] = (analogRead(V2) - 2048) / 20;

  String output;
  serializeJson(doc, output);

  Serial.println(output);
  delay(100);
}