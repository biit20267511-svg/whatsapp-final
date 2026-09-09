from pydantic import BaseModel, EmailStr, Field

class RestaurantCreate(BaseModel):
    restaurant_name: str
    owner_name: str
    phone: str = ""
    email: EmailStr
    username: str | None = None
    password: str | None = None
    monthly_price: float = 5000
    setup_fee: float = 5000
    start_date: str
    duration_days: int = Field(default=30, ge=1, le=365)
    whatsapp_number: str = ""
    address: str = ""
    city: str = ""
    delivery_fee: float = 150
    prep_time_min: int = 20
    delivery_time_min: int = 15

class RestaurantUpdate(BaseModel):
    name: str | None = None
    owner_name: str | None = None
    phone: str | None = None
    city: str | None = None
    address: str | None = None
    whatsapp_number: str | None = None
    delivery_fee: float | None = None
    prep_time_min: int | None = None
    delivery_time_min: int | None = None
    monthly_price: float | None = None

class CredentialsUpdate(BaseModel):
    email: EmailStr | None = None
    username: str | None = None
    new_password: str | None = None

class StatusUpdate(BaseModel):
    status: str

class ExtendBody(BaseModel):
    days: int = Field(default=30, ge=1, le=365)

class ReminderBody(BaseModel):
    restaurant_id: str

class AdminSettingsUpdate(BaseModel):
    monthly_price: float | None = None
    setup_fee: float | None = None
    reminder_template: str | None = None

class AdminProfileUpdate(BaseModel):
    email: EmailStr | None = None
    current_password: str
    new_password: str | None = None

class GoogleSheetsConfigBody(BaseModel):
    spreadsheet_id: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""